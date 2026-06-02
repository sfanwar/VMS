import { applyDecorators } from '@nestjs/common';
import { IsString, MinLength, Matches } from 'class-validator';

/** Human-readable summary of the password policy (for API docs / UI hints). */
export const PASSWORD_POLICY_DESCRIPTION =
  'At least 12 characters, including an uppercase letter, a lowercase letter, a digit, and a symbol.';

/**
 * Password-complexity policy (OWASP-aligned). Single source of truth — apply to
 * any DTO field that accepts a user-chosen password so the rules cannot drift.
 */
export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(12, { message: 'Password must be at least 12 characters' }),
    Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' }),
    Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' }),
    Matches(/[0-9]/, { message: 'Password must contain a digit' }),
    Matches(/[^A-Za-z0-9]/, { message: 'Password must contain a symbol' }),
  );
}
