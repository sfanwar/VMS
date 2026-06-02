import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PERSONAS_KEY = 'requiredPersonas';

/**
 * Decorator to mark an endpoint as requiring one of the listed personas.
 * @example @RequirePersona('DIRECTOR', 'SENIOR_OFFICER')
 */
export const RequirePersona = (...personas: string[]) => SetMetadata(PERSONAS_KEY, personas);

@Injectable()
export class PersonaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERSONAS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userPersonas: string[] = request.user?.personas ?? [];

    const ok = required.some((p) => userPersonas.includes(p));
    if (!ok) {
      throw new ForbiddenException({
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        message: `Requires one of: ${required.join(', ')}`,
      });
    }
    return true;
  }
}
