import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OfficesService } from './offices.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PersonaGuard, RequirePersona } from '../common/guards/persona.guard';

class CreateOfficeDto {
  @IsString() @MinLength(2) @MaxLength(200) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameAr!: string;
  @IsString() @MinLength(2) @MaxLength(200) authorizedPerson!: string;
  @IsString() @MinLength(5) @MaxLength(50) telephoneNumber!: string;
}

class UpdateOfficeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nameEn?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) nameAr?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) authorizedPerson?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(50) telephoneNumber?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateContactDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsString() @MinLength(5) @MaxLength(50) telephoneNumber!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

class UpdateContactDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(50) telephoneNumber?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('offices')
@Controller('offices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OfficesController {
  constructor(private readonly offices: OfficesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active offices (with contacts)' })
  list() {
    return this.offices.findAll();
  }

  @Get('all')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'List all offices incl. inactive (System Administrator only)' })
  listAll() {
    return this.offices.findAllForAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get office by id' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.offices.findById(id);
  }

  @Post()
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Create a new office (System Administrator only)' })
  create(@Body() dto: CreateOfficeDto) {
    return this.offices.create(dto);
  }

  @Patch(':id')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Update an office (System Administrator only)' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateOfficeDto) {
    return this.offices.update(id, dto);
  }

  @Post(':id/contacts')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Add an authorized contact to an office (System Administrator only)' })
  addContact(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateContactDto) {
    return this.offices.addContact(id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Update an office contact (System Administrator only)' })
  updateContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.offices.updateContact(id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Remove an office contact (System Administrator only)' })
  removeContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
  ) {
    return this.offices.removeContact(id, contactId);
  }
}
