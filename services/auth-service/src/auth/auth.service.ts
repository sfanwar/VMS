import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Credential } from './entities/credential.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginAudit } from './entities/login-audit.entity';

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface UserPersona {
  code: string;
  nameEn: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr?: string;
  officeId?: string;
  personas: UserPersona[];
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserProfile;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Credential) private readonly credRepo: Repository<Credential>,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(LoginAudit) private readonly auditRepo: Repository<LoginAudit>,
    private readonly jwt: JwtService,
  ) {}

  /** Public for testing */
  static hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  /**
   * Provision login credentials for a newly created user. Called internally by
   * user-service. Idempotency is the caller's responsibility (user-service
   * rejects duplicate emails before reaching here); a clash is reported as 409.
   */
  async createCredential(userId: string, email: string, password: string): Promise<void> {
    const clash = await this.credRepo.findOne({ where: [{ userId }, { email }] });
    if (clash) {
      throw new ConflictException({ errorCode: 'CREDENTIAL_EXISTS', message: 'Credential already exists for this user or email' });
    }
    const passwordHash = await this.hashPassword(password);
    await this.credRepo.save(this.credRepo.create({ userId, email, passwordHash }));
    this.logger.log(`Credential provisioned for ${email}`);
  }

  /**
   * Administratively reset a user's password (no current-password check — this
   * is driven by a SYSADMIN via user-service). Clears any lockout and revokes
   * all refresh tokens so existing sessions cannot continue.
   */
  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const cred = await this.credRepo.findOne({ where: { userId } });
    if (!cred) throw new NotFoundException({ errorCode: 'CREDENTIAL_NOT_FOUND', message: 'No credential for this user' });
    cred.passwordHash = await this.hashPassword(newPassword);
    cred.failedLogins = 0;
    cred.lockedUntil = undefined;
    await this.credRepo.save(cred);
    await this.refreshRepo.update({ userId, revokedAt: undefined }, { revokedAt: new Date() });
    this.logger.log(`Password reset for ${cred.email}`);
  }

  /**
   * Enable or disable login for a user. Disabling also revokes refresh tokens so
   * the account is locked out immediately, not just on next access-token expiry.
   */
  async setCredentialStatus(userId: string, isActive: boolean): Promise<void> {
    const cred = await this.credRepo.findOne({ where: { userId } });
    if (!cred) throw new NotFoundException({ errorCode: 'CREDENTIAL_NOT_FOUND', message: 'No credential for this user' });
    cred.isActive = isActive;
    await this.credRepo.save(cred);
    if (!isActive) {
      await this.refreshRepo.update({ userId, revokedAt: undefined }, { revokedAt: new Date() });
    }
    this.logger.log(`Credential for ${cred.email} ${isActive ? 'enabled' : 'disabled'}`);
  }

  async login(email: string, password: string, ctx: LoginContext): Promise<LoginResult> {
    // Always do bcrypt work even if email unknown — prevents timing-based user enumeration
    const cred = await this.credRepo.findOne({ where: { email } });
    const hashToCompare = cred?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv.';

    // Account lockout check (only meaningful if user exists)
    if (cred?.lockedUntil && cred.lockedUntil > new Date()) {
      await this.audit(email, cred?.userId, false, 'LOCKED', ctx);
      throw new HttpException(
        { statusCode: 423, errorCode: 'ACCOUNT_LOCKED', message: 'Account is temporarily locked' },
        423,
      );
    }

    const ok = await bcrypt.compare(password, hashToCompare);

    if (!cred || !cred.isActive || !ok) {
      if (cred && ok === false) {
        cred.failedLogins += 1;
        if (cred.failedLogins >= MAX_FAILED_LOGINS) {
          cred.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
          cred.failedLogins = 0;
          this.logger.warn(`Account locked: ${email}`);
        }
        await this.credRepo.save(cred);
      }
      await this.audit(email, cred?.userId, false, 'INVALID_CREDENTIALS', ctx);
      throw new UnauthorizedException({ errorCode: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    // Success — reset counters
    cred.failedLogins = 0;
    cred.lockedUntil = undefined;
    cred.lastLoginAt = new Date();
    cred.lastLoginIp = ctx.ipAddress ?? undefined;
    await this.credRepo.save(cred);

    // Fetch user profile + personas from user-service
    const profile = await this.fetchUserProfile(cred.userId);

    // Issue tokens
    const accessToken = this.signAccessToken(profile);
    const refreshTokenPlain = this.generateRefreshToken();
    await this.persistRefreshToken(cred.userId, refreshTokenPlain, ctx);

    await this.audit(email, cred.userId, true, 'SUCCESS', ctx);

    return {
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: 15 * 60,
      user: profile,
    };
  }

  async refresh(refreshTokenPlain: string, ctx: LoginContext): Promise<LoginResult> {
    const tokenHash = AuthService.hashRefreshToken(refreshTokenPlain);
    const existing = await this.refreshRepo.findOne({
      where: { tokenHash, revokedAt: undefined, expiresAt: MoreThan(new Date()) },
    });

    if (!existing) {
      throw new UnauthorizedException({ errorCode: 'REFRESH_TOKEN_INVALID', message: 'Refresh token invalid or expired' });
    }
    if (existing.revokedAt) {
      throw new UnauthorizedException({ errorCode: 'REFRESH_TOKEN_REVOKED', message: 'Refresh token has been revoked' });
    }

    // Rotate: revoke old, issue new
    existing.revokedAt = new Date();
    await this.refreshRepo.save(existing);

    const profile = await this.fetchUserProfile(existing.userId);
    const accessToken = this.signAccessToken(profile);
    const refreshTokenNew = this.generateRefreshToken();
    await this.persistRefreshToken(existing.userId, refreshTokenNew, ctx);

    return { accessToken, refreshToken: refreshTokenNew, expiresIn: 15 * 60, user: profile };
  }

  async logout(refreshTokenPlain: string): Promise<void> {
    const tokenHash = AuthService.hashRefreshToken(refreshTokenPlain);
    const found = await this.refreshRepo.findOne({ where: { tokenHash } });
    if (found && !found.revokedAt) {
      found.revokedAt = new Date();
      await this.refreshRepo.save(found);
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const cred = await this.credRepo.findOne({ where: { userId } });
    if (!cred) throw new UnauthorizedException();

    const ok = await bcrypt.compare(currentPassword, cred.passwordHash);
    if (!ok) throw new ForbiddenException({ errorCode: 'CURRENT_PASSWORD_WRONG', message: 'Current password is incorrect' });

    cred.passwordHash = await this.hashPassword(newPassword);
    await this.credRepo.save(cred);

    // Invalidate all refresh tokens — force re-login on other devices
    await this.refreshRepo.update({ userId, revokedAt: undefined }, { revokedAt: new Date() });
  }

  private signAccessToken(profile: UserProfile): string {
    const payload = {
      sub: profile.id,
      email: profile.email,
      personas: profile.personas.map((p) => p.code),
      officeId: profile.officeId,
    };
    return this.jwt.sign(payload, { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' });
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private async persistRefreshToken(userId: string, plain: string, ctx: LoginContext): Promise<void> {
    const expiresAt = new Date(Date.now() + this.parseRefreshTtlMs());
    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId,
        tokenHash: AuthService.hashRefreshToken(plain),
        expiresAt,
        userAgent: ctx.userAgent ?? undefined,
        ipAddress: ctx.ipAddress ?? undefined,
      }),
    );
  }

  private parseRefreshTtlMs(): number {
    const raw = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
    const match = raw.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const n = Number(match[1]);
    const unit = match[2];
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
  }

  private async audit(
    email: string,
    userId: string | undefined,
    success: boolean,
    reason: string,
    ctx: LoginContext,
  ): Promise<void> {
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          email,
          userId: userId ?? undefined,
          success,
          reason: reason ?? undefined,
          ipAddress: ctx.ipAddress ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
        }),
      );
    } catch (err) {
      // Audit failure must not break auth flow, but must be logged
      this.logger.error('Failed to write login audit', err as Error);
    }
  }

  /**
   * Resolves user profile and personas via user-service.
   * In a real deployment, this would call user-service over HTTP with a service-account token.
   * For the scaffold, we issue a minimal profile based on what auth knows + a fallback HTTP call.
   */
  private async fetchUserProfile(userId: string): Promise<UserProfile> {
    const userServiceUrl = process.env.USER_SERVICE_URL;
    if (!userServiceUrl) {
      // Fallback: minimal profile (used in tests)
      const cred = await this.credRepo.findOne({ where: { userId } });
      return {
        id: userId,
        email: cred?.email ?? '',
        fullNameEn: cred?.email ?? '',
        personas: [],
      };
    }

    try {
      // Internal endpoint — protected by a service-to-service shared secret in production
      const res = await fetch(`${userServiceUrl}/api/internal/users/${userId}/profile`, {
        headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key' },
      });
      if (!res.ok) throw new Error(`User service returned ${res.status}`);
      return (await res.json()) as UserProfile;
    } catch (err) {
      this.logger.error(`Failed to fetch profile for ${userId}`, err as Error);
      // Degrade gracefully
      const cred = await this.credRepo.findOne({ where: { userId } });
      return {
        id: userId,
        email: cred?.email ?? '',
        fullNameEn: cred?.email ?? '',
        personas: [],
      };
    }
  }
}
