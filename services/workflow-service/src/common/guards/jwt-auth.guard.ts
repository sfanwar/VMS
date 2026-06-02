import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  personas: string[];
  officeId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({ errorCode: 'MISSING_TOKEN', message: 'Bearer token required' });
    }
    const token = auth.slice('Bearer '.length);
    try {
      const payload = this.jwt.verify(token);
      (request as any).user = {
        id: payload.sub,
        email: payload.email,
        personas: payload.personas ?? [],
        officeId: payload.officeId,
      } satisfies AuthenticatedUser;
      return true;
    } catch {
      throw new UnauthorizedException({ errorCode: 'INVALID_TOKEN', message: 'JWT invalid or expired' });
    }
  }
}
