import {
  Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Query, Res,
  UnauthorizedException, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { DocumentKind } from '../entities/document.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

const DOCUMENT_KINDS: DocumentKind[] = [
  'OFFICE_LETTER', 'BENEFICIARY_ATTACHMENT', 'EMBASSY_VISA_FORM',
  'SUPPORTING_DOCUMENT', 'EMBASSY_LETTER', 'VISA_APPLICATION', 'VISA',
];

class UploadMetadataDto {
  @IsUUID() requestId!: string;
  @IsOptional() @IsUUID() beneficiaryId?: string;
  @IsEnum(DOCUMENT_KINDS) kind!: DocumentKind;
}

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a document to a request' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: UploadMetadataDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new Error('File is required');
    return this.documents.upload({
      requestId: meta.requestId,
      beneficiaryId: meta.beneficiaryId,
      kind: meta.kind,
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      uploadedBy: actor.id,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List documents for a request' })
  list(@Query('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.documents.listByRequest(requestId);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stream the document bytes' })
  async download(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) {
    const { stream, doc } = await this.documents.getDownloadStream(id);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalName)}"`);
    stream.pipe(res);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a document' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.documents.softDelete(id);
    return { deleted: true };
  }

  // ───────────── Internal — used by workflow-service ─────────────
  @Get('../internal/documents/counts')
  @ApiOperation({ summary: '[Internal] Document counts by kind' })
  async internalCounts(
    @Query('requestId', new ParseUUIDPipe()) requestId: string,
    @Headers('x-internal-key') key: string,
  ) {
    const expected = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    if (!key || key !== expected) throw new UnauthorizedException();
    return this.documents.countsByKind(requestId);
  }
}

@Controller('internal/documents')
export class InternalDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('counts')
  @ApiOperation({ summary: '[Internal] Document counts by kind' })
  async counts(
    @Query('requestId', new ParseUUIDPipe()) requestId: string,
    @Headers('x-internal-key') key: string,
  ) {
    const expected = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    if (!key || key !== expected) throw new UnauthorizedException();
    return this.documents.countsByKind(requestId);
  }
}
