import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsUUID } from 'class-validator';
import { IsStrongPassword, PASSWORD_POLICY_DESCRIPTION } from '../../common/is-strong-password';

/**
 * Payload for the internal credential-provisioning endpoint, called by
 * user-service when a new user is created. The password policy is enforced
 * here too (defense in depth) so a credential can never be created weak.
 */
export class CreateCredentialDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: PASSWORD_POLICY_DESCRIPTION })
  @IsStrongPassword()
  password!: string;
}

/** Admin-driven password reset (no current-password check). */
export class ResetCredentialDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: PASSWORD_POLICY_DESCRIPTION })
  @IsStrongPassword()
  password!: string;
}

/** Enable/disable login for a user. */
export class CredentialStatusDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
