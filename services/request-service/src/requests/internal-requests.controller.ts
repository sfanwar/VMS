import { Body, Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Patch, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { RequestsService } from './requests.service';
import { VisaRequest } from '../entities/visa-request.entity';

class InternalStatusUpdateDto {
  @IsString() newStatus!: any;
  @IsOptional() @IsUUID() assigneeId?: string;
}

@ApiTags('internal')
@Controller('internal/requests')
export class InternalRequestsController {
  constructor(
    private readonly service: RequestsService,
    @InjectRepository(VisaRequest) private readonly requests: Repository<VisaRequest>,
  ) {}

  private checkInternalKey(key: string) {
    const expected = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    if (!key || key !== expected) {
      throw new UnauthorizedException({ errorCode: 'INVALID_INTERNAL_KEY' });
    }
  }

  @Get(':id/snapshot')
  @ApiOperation({ summary: '[Internal] Get current status + beneficiary count (workflow-service)' })
  async snapshot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-internal-key') key: string,
  ) {
    this.checkInternalKey(key);
    const r = await this.requests.findOne({ where: { id }, relations: ['beneficiaries'] });
    if (!r) throw new NotFoundException();
    return {
      id: r.id,
      status: r.status,
      officeId: r.officeId,
      createdByUserId: r.createdByUserId,
      beneficiaryCount: r.beneficiaries?.length ?? 0,
    };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '[Internal] Update request status (workflow-service only)' })
  async setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InternalStatusUpdateDto,
    @Headers('x-internal-key') key: string,
  ) {
    this.checkInternalKey(key);
    return this.service.setStatus(id, dto.newStatus, dto.assigneeId);
  }
}
