import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword, PASSWORD_POLICY_DESCRIPTION } from '../common/is-strong-password';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: PASSWORD_POLICY_DESCRIPTION })
  @IsStrongPassword()
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullNameEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullNameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiProperty({ description: 'Persona codes like SENIOR_ADMIN, DIRECTOR', example: ['DIRECTOR'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  personaCodes!: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  fullNameEn?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  fullNameAr?: string;

  @ApiPropertyOptional({ description: 'Office UUID, or null to unassign' })
  @IsOptional() @IsUUID()
  officeId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Replaces the full persona set' })
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true })
  personaCodes?: string[];
}

export class ResetPasswordDto {
  @ApiProperty({ description: PASSWORD_POLICY_DESCRIPTION })
  @IsStrongPassword()
  password!: string;
}
