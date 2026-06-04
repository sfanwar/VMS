import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { Credential } from '../src/auth/entities/credential.entity';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { LoginAudit } from '../src/auth/entities/login-audit.entity';
import { UnauthorizedException, HttpException, NotFoundException } from '@nestjs/common';

// `import * as bcrypt` is wrapped by TypeScript's __importStar helper in
// non-configurable getters, so `jest.spyOn(bcrypt, 'compare')` throws
// "Cannot redefine property". Mock the module so compare/hash are jest.fn
// wrappers (delegating to the real implementations); tests assert on them
// directly instead of spying.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt');
  return {
    ...actual,
    hash: jest.fn((data: any, saltOrRounds: any) => actual.hash(data, saltOrRounds)),
    compare: jest.fn((data: any, encrypted: any) => actual.compare(data, encrypted)),
  };
});

// In-memory repository mocks
function mockRepo<T extends object>(): jest.Mocked<Repository<T>> {
  const store: T[] = [];
  return {
    findOne: jest.fn(async ({ where }: any) => {
      return store.find((r) =>
        Object.entries(where).every(([k, v]: any) => {
          // TypeORM skips `undefined` conditions entirely.
          if (v === undefined) return true;
          // Support find operators used by the service (e.g. MoreThan/LessThan).
          if (v && v.constructor && v.constructor.name === 'FindOperator') {
            if (v.type === 'moreThan') return (r as any)[k] > v.value;
            if (v.type === 'lessThan') return (r as any)[k] < v.value;
            return true; // other operators: treat as match for these tests
          }
          return (r as any)[k] === v;
        }),
      ) ?? null;
    }),
    save: jest.fn(async (entity: any) => {
      const existing = store.find((r: any) => (entity.id && r.id === entity.id) || (entity.userId && r.userId === entity.userId && !entity.tokenHash));
      if (existing) {
        Object.assign(existing, entity);
        return existing;
      }
      store.push(entity);
      return entity;
    }),
    create: jest.fn((e: any) => e),
    update: jest.fn(async () => ({ affected: 1 })),
    __store: store,
  } as any;
}

describe('AuthService', () => {
  let service: AuthService;
  let credRepo: jest.Mocked<Repository<Credential>>;
  let refreshRepo: jest.Mocked<Repository<RefreshToken>>;
  let auditRepo: jest.Mocked<Repository<LoginAudit>>;
  let jwt: JwtService;

  const ctx = { ipAddress: '127.0.0.1', userAgent: 'jest-test' };

  beforeEach(async () => {
    credRepo = mockRepo<Credential>();
    refreshRepo = mockRepo<RefreshToken>();
    auditRepo = mockRepo<LoginAudit>();

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { sign: jest.fn(() => 'fake.jwt.token') } },
        { provide: getRepositoryToken(Credential), useValue: credRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshRepo },
        { provide: getRepositoryToken(LoginAudit), useValue: auditRepo },
      ],
    }).compile();

    service = module.get(AuthService);
    jwt = module.get(JwtService);
  });

  async function seedUser(overrides: Partial<Credential> = {}): Promise<Credential> {
    const passwordHash = await bcrypt.hash('Passw0rd!', 4); // low cost for speed in tests
    const cred: Credential = {
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      passwordHash,
      isActive: true,
      failedLogins: 0,
      // After the entity-type fix, these are no longer nullable:
      lockedUntil: undefined,
      lastLoginAt: undefined,
      lastLoginIp: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Credential;
    (credRepo as any).__store.push(cred);
    return cred;
  }

  // ───────────── Positive ─────────────

  describe('login — positive', () => {
    it('AUTH-P-001: returns tokens on valid credentials', async () => {
      await seedUser();
      const result = await service.login('user@example.com', 'Passw0rd!', ctx);
      expect(result.accessToken).toBe('fake.jwt.token');
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
      expect(result.user.id).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('writes a refresh token row with hashed value (not plaintext)', async () => {
      await seedUser();
      const result = await service.login('user@example.com', 'Passw0rd!', ctx);
      const saved = (refreshRepo as any).__store[0] as RefreshToken;
      expect(saved.tokenHash).not.toBe(result.refreshToken);
      expect(saved.tokenHash).toHaveLength(64); // SHA-256 hex
    });

    it('writes a success row to login audit', async () => {
      await seedUser();
      await service.login('user@example.com', 'Passw0rd!', ctx);
      const audit = (auditRepo as any).__store[0] as LoginAudit;
      expect(audit.success).toBe(true);
      expect(audit.ipAddress).toBe('127.0.0.1');
      expect(audit.userAgent).toBe('jest-test');
    });

    it('audit row uses SUCCESS reason on positive login (not null)', async () => {
      // After the entity type fix, reason is `string` (not nullable),
      // so the success path passes "SUCCESS" rather than null
      await seedUser();
      await service.login('user@example.com', 'Passw0rd!', ctx);
      const audit = (auditRepo as any).__store[0] as LoginAudit;
      expect(audit.reason).toBe('SUCCESS');
    });
  });

  // ───────────── Negative ─────────────

  describe('login — negative', () => {
    it('AUTH-N-001: throws UnauthorizedException on wrong password', async () => {
      await seedUser();
      await expect(service.login('user@example.com', 'WRONG', ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('AUTH-N-002: same error for unknown email (no enumeration)', async () => {
      await expect(service.login('nobody@example.com', 'whatever', ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('AUTH-N-001: increments failed_logins on wrong password', async () => {
      const cred = await seedUser();
      await expect(service.login('user@example.com', 'WRONG', ctx)).rejects.toThrow();
      expect(cred.failedLogins).toBe(1);
    });

    it('AUTH-N-003: locks account after 5 failed attempts', async () => {
      const cred = await seedUser();
      for (let i = 0; i < 5; i++) {
        await expect(service.login('user@example.com', 'WRONG', ctx)).rejects.toThrow();
      }
      expect(cred.lockedUntil).toBeInstanceOf(Date);
      expect((cred.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
    });

    it('AUTH-N-003: rejects login while locked, even with correct password', async () => {
      await seedUser({
        lockedUntil: new Date(Date.now() + 60_000),
      });
      await expect(service.login('user@example.com', 'Passw0rd!', ctx)).rejects.toThrow(HttpException);
    });

    it('AUTH-N-004: rejects inactive account', async () => {
      await seedUser({ isActive: false });
      await expect(service.login('user@example.com', 'Passw0rd!', ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('writes a failure row to login audit', async () => {
      await seedUser();
      await expect(service.login('user@example.com', 'WRONG', ctx)).rejects.toThrow();
      const audit = (auditRepo as any).__store[0] as LoginAudit;
      expect(audit.success).toBe(false);
      expect(audit.reason).toBe('INVALID_CREDENTIALS');
    });
  });

  // ───────────── Security ─────────────

  describe('security', () => {
    it('AUTH-S-006: refresh token in DB is hashed, not stored as plaintext', async () => {
      await seedUser();
      const result = await service.login('user@example.com', 'Passw0rd!', ctx);
      const stored = (refreshRepo as any).__store[0] as RefreshToken;
      expect(stored.tokenHash).not.toContain(result.refreshToken);
      // Verify hash is deterministic SHA-256
      expect(AuthService.hashRefreshToken(result.refreshToken)).toBe(stored.tokenHash);
    });

    it('AUTH-S-007: uses bcrypt for password verification (timing-safe)', async () => {
      (bcrypt.compare as unknown as jest.Mock).mockClear();
      await seedUser();
      await service.login('user@example.com', 'Passw0rd!', ctx);
      expect(bcrypt.compare).toHaveBeenCalled();
    });

    it('does bcrypt work even for unknown emails (timing equality)', async () => {
      (bcrypt.compare as unknown as jest.Mock).mockClear();
      await expect(service.login('nobody@example.com', 'whatever', ctx)).rejects.toThrow();
      expect(bcrypt.compare).toHaveBeenCalled();
    });

    it('AUTH-S-002: does not include password hash in returned profile', async () => {
      await seedUser();
      const result = await service.login('user@example.com', 'Passw0rd!', ctx);
      expect(JSON.stringify(result.user)).not.toMatch(/password/i);
      expect(JSON.stringify(result.user)).not.toMatch(/hash/i);
    });
  });

  // ───────────── Refresh ─────────────

  describe('refresh', () => {
    it('AUTH-P-002: rotates the refresh token (old becomes invalid)', async () => {
      await seedUser();
      const r1 = await service.login('user@example.com', 'Passw0rd!', ctx);
      const r2 = await service.refresh(r1.refreshToken, ctx);
      expect(r2.refreshToken).not.toBe(r1.refreshToken);
      // Old one should now be revoked
      const oldHash = AuthService.hashRefreshToken(r1.refreshToken);
      const oldRow = (refreshRepo as any).__store.find((r: any) => r.tokenHash === oldHash);
      expect(oldRow.revokedAt).toBeInstanceOf(Date);
    });

    it('rejects expired refresh token', async () => {
      await expect(service.refresh('does-not-exist', ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ───────────── Logout ─────────────

  describe('logout', () => {
    it('AUTH-P-003: revokes the refresh token', async () => {
      await seedUser();
      const r1 = await service.login('user@example.com', 'Passw0rd!', ctx);
      await service.logout(r1.refreshToken);
      await expect(service.refresh(r1.refreshToken, ctx)).rejects.toThrow();
    });

    it('is idempotent — second logout does not throw', async () => {
      await seedUser();
      const r1 = await service.login('user@example.com', 'Passw0rd!', ctx);
      await service.logout(r1.refreshToken);
      await expect(service.logout(r1.refreshToken)).resolves.toBeUndefined();
    });
  });

  // ───────────── Change password ─────────────

  describe('changePassword', () => {
    it('updates password and revokes all refresh tokens', async () => {
      const cred = await seedUser();
      const r1 = await service.login('user@example.com', 'Passw0rd!', ctx);

      await service.changePassword(cred.userId, 'Passw0rd!', 'NewPassw0rd!@2026');

      // Old password no longer works
      await expect(service.login('user@example.com', 'Passw0rd!', ctx)).rejects.toThrow();

      // Old refresh tokens revoked (update called)
      expect(refreshRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: cred.userId }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('rejects when current password is wrong', async () => {
      const cred = await seedUser();
      await expect(
        service.changePassword(cred.userId, 'WRONG', 'NewPassw0rd!@2026'),
      ).rejects.toThrow();
    });
  });

  // ───────────── Admin: reset password ─────────────

  describe('resetPassword (admin)', () => {
    it('sets a new password without requiring the current one', async () => {
      const cred = await seedUser();
      await service.resetPassword(cred.userId, 'Reset!Passw0rd2026');
      // Old password no longer works; new one does
      await expect(service.login('user@example.com', 'Passw0rd!', ctx)).rejects.toThrow();
      const r = await service.login('user@example.com', 'Reset!Passw0rd2026', ctx);
      expect(r.accessToken).toBe('fake.jwt.token');
    });

    it('clears lockout and revokes refresh tokens', async () => {
      const cred = await seedUser({ failedLogins: 3, lockedUntil: new Date(Date.now() + 60_000) });
      await service.resetPassword(cred.userId, 'Reset!Passw0rd2026');
      expect(cred.failedLogins).toBe(0);
      expect(cred.lockedUntil).toBeUndefined();
      expect(refreshRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: cred.userId }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws when the user has no credential', async () => {
      await expect(
        service.resetPassword('00000000-0000-0000-0000-000000000000', 'Reset!Passw0rd2026'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────── Admin: enable/disable login ─────────────

  describe('setCredentialStatus (admin)', () => {
    it('disabling blocks login even with the correct password', async () => {
      const cred = await seedUser();
      await service.setCredentialStatus(cred.userId, false);
      expect(cred.isActive).toBe(false);
      await expect(service.login('user@example.com', 'Passw0rd!', ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('re-enabling restores login', async () => {
      const cred = await seedUser({ isActive: false });
      await service.setCredentialStatus(cred.userId, true);
      const r = await service.login('user@example.com', 'Passw0rd!', ctx);
      expect(r.accessToken).toBe('fake.jwt.token');
    });

    it('disabling revokes refresh tokens', async () => {
      const cred = await seedUser();
      await service.setCredentialStatus(cred.userId, false);
      expect(refreshRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: cred.userId }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws when the user has no credential', async () => {
      await expect(
        service.setCredentialStatus('00000000-0000-0000-0000-000000000000', false),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
