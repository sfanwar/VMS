import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateCredentialDto, ResetCredentialDto, CredentialStatusDto } from './dto/internal-credential.dto';

/**
 * Service-to-service endpoints, protected by a shared internal key (the same
 * pattern user-service uses for its profile endpoint). Not exposed publicly:
 * the API gateway only proxies /api/auth/*, never /api/internal/*.
 */
@ApiExcludeController()
@Controller('internal')
export class InternalController {
  constructor(private readonly authService: AuthService) {}

  @Post('credentials')
  @HttpCode(201)
  async createCredential(
    @Body() dto: CreateCredentialDto,
    @Headers('x-internal-key') key: string,
  ): Promise<{ status: 'created' }> {
    this.assertInternal(key);
    await this.authService.createCredential(dto.userId, dto.email, dto.password);
    return { status: 'created' };
  }

  @Post('credentials/reset')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: ResetCredentialDto,
    @Headers('x-internal-key') key: string,
  ): Promise<{ status: 'reset' }> {
    this.assertInternal(key);
    await this.authService.resetPassword(dto.userId, dto.password);
    return { status: 'reset' };
  }

  @Post('credentials/status')
  @HttpCode(200)
  async setStatus(
    @Body() dto: CredentialStatusDto,
    @Headers('x-internal-key') key: string,
  ): Promise<{ status: 'updated' }> {
    this.assertInternal(key);
    await this.authService.setCredentialStatus(dto.userId, dto.isActive);
    return { status: 'updated' };
  }

  private assertInternal(key: string): void {
    const expected = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    if (!key || key !== expected) {
      throw new UnauthorizedException({ errorCode: 'INVALID_INTERNAL_KEY', message: 'Service-to-service auth failed' });
    }
  }
}
