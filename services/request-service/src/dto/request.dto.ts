import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, Max, MaxLength,
  ValidateNested, ArrayMinSize,
} from 'class-validator';

export class CreateBeneficiaryDto {
  @ApiProperty()
  @IsString() @MaxLength(200)
  fullNameEn!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  fullNameAr?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(50)
  passportNumber?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  nationality?: string;
}

export class CreateRequestDto {
  @ApiPropertyOptional({ description: 'Required for Senior Admin creating on behalf of an office. Office users have it auto-assigned.' })
  @IsOptional() @IsUUID()
  officeId?: string;

  @ApiPropertyOptional({ description: 'Selected authorized person for the office (users.office_contacts.id).' })
  @IsOptional() @IsUUID()
  officeContactId?: string;

  @ApiProperty()
  @IsUUID()
  countryOfVisitId!: string;

  @ApiProperty()
  @IsUUID()
  visaTypeId!: string;

  @ApiProperty({ minimum: 1, maximum: 50 })
  @IsInt() @Min(1) @Max(50)
  numberOfPassengers!: number;

  @ApiProperty({ type: [CreateBeneficiaryDto] })
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBeneficiaryDto)
  beneficiaries!: CreateBeneficiaryDto[];
}

export class UpdateRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() countryOfVisitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() visaTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) numberOfPassengers?: number;
}

export class UpdateFeesDto {
  @ApiProperty({ description: 'Fee amount in selected currency' })
  @IsString() // money as string to preserve precision
  feesAmount!: string;

  @ApiPropertyOptional({ default: 'AED' })
  @IsOptional() @IsString() @MaxLength(3)
  feesCurrency?: string;
}

// Mirror of the request_status enum in Postgres (init.sql). Must contain
// all 13 values; the @IsEnum check below rejects anything not in this list,
// so missing one here makes that status un-filterable from the UI.
const ALL_STATUSES = ['DRAFT','SUBMITTED','INITIAL_VERIFICATION','FINAL_VERIFICATION','DIRECTOR_REVIEW','TYPIST_PROCESSING','WAITING_FOR_EMBASSY','AT_EMBASSY','TYPIST_FEE_UPDATE','WAITING_FINAL_REVIEW','COMPLETED','RETURNED_TO_OFFICE','APOLOGIZED','REJECTED'] as const;

export class ListRequestsQueryDto {
  @ApiPropertyOptional({ enum: ALL_STATUSES })
  @IsOptional() @IsEnum(ALL_STATUSES)
  status?: typeof ALL_STATUSES[number];

  @ApiPropertyOptional() @IsOptional() @IsUUID() officeId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) page?: number;
  // Dashboard aggregations need up to 1000 rows in a single fetch; for a
  // single-tenant FAD deployment this is well within memory and response-size budgets.
  // The cap remains a safety net against accidental unbounded queries.
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(1000) pageSize?: number;
}
