import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { ReferenceService } from './reference.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PersonaGuard, RequirePersona } from '../common/guards/persona.guard';

class CreateCountryDto {
  @IsString() @Length(2, 2) isoCode!: string;
  @IsString() @MinLength(2) @MaxLength(100) nameEn!: string;
  @IsString() @MinLength(1) @MaxLength(100) nameAr!: string;
}

class CreateVisaTypeDto {
  @IsString() @MinLength(2) @MaxLength(30) code!: string;
  @IsString() @MinLength(2) @MaxLength(100) nameEn!: string;
  @IsString() @MinLength(1) @MaxLength(100) nameAr!: string;
}

class UpdateReferenceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) nameEn?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) nameAr?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('reference')
@Controller('reference')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Get('countries')
  @ApiOperation({ summary: 'List countries (active only unless includeInactive=true)' })
  listCountries(@Query('includeInactive') includeInactive?: string) {
    return this.reference.listCountries(includeInactive === 'true');
  }

  @Post('countries')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Add a country (System Administrator only)' })
  createCountry(@Body() dto: CreateCountryDto) {
    return this.reference.createCountry(dto);
  }

  @Patch('countries/:id')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Update / (de)activate a country (System Administrator only)' })
  updateCountry(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateReferenceDto) {
    return this.reference.updateCountry(id, dto);
  }

  @Get('visa-types')
  @ApiOperation({ summary: 'List visa types (active only unless includeInactive=true)' })
  listVisaTypes(@Query('includeInactive') includeInactive?: string) {
    return this.reference.listVisaTypes(includeInactive === 'true');
  }

  @Post('visa-types')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Add a visa type (System Administrator only)' })
  createVisaType(@Body() dto: CreateVisaTypeDto) {
    return this.reference.createVisaType(dto);
  }

  @Patch('visa-types/:id')
  @UseGuards(PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiOperation({ summary: 'Update / (de)activate a visa type (System Administrator only)' })
  updateVisaType(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateReferenceDto) {
    return this.reference.updateVisaType(id, dto);
  }
}
