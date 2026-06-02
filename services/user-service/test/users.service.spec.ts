import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/entities/user.entity';
import { Persona, UserPersona } from '../src/entities/user-persona.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';

function mockRepo<T extends object>(): any {
  const store: T[] = [];
  return {
    find: jest.fn(async (opts?: any) => {
      if (!opts?.where) return [...store];
      const where = opts.where as any;
      if (where.code?._type === 'in') {
        const codes: string[] = where.code._value;
        return store.filter((s: any) => codes.includes(s.code));
      }
      return store.filter((s: any) =>
        Object.entries(where).every(([k, v]) => s[k] === v),
      );
    }),
    findOne: jest.fn(async (opts: any) => {
      return store.find((s: any) =>
        Object.entries(opts.where).every(([k, v]) => s[k] === v),
      ) ?? null;
    }),
    save: jest.fn(async (entity: any) => {
      if (Array.isArray(entity)) {
        store.push(...entity);
        return entity;
      }
      if (!entity.id) entity.id = `id-${store.length + 1}`;
      const existing = store.find((s: any) => s.id === entity.id);
      if (existing) Object.assign(existing, entity);
      else store.push(entity);
      return entity;
    }),
    delete: jest.fn(async (criteria: any) => {
      let affected = 0;
      for (let i = store.length - 1; i >= 0; i--) {
        if (Object.entries(criteria).every(([k, v]) => (store[i] as any)[k] === v)) {
          store.splice(i, 1);
          affected++;
        }
      }
      return { affected };
    }),
    create: jest.fn((e: any) => e),
    __store: store,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: any;
  let personaRepo: any;
  let upRepo: any;
  let fetchMock: jest.Mock;

  const strongPassword = 'Str0ng!Passw0rd';

  beforeEach(async () => {
    userRepo = mockRepo<User>();
    personaRepo = mockRepo<Persona>();
    upRepo = mockRepo<UserPersona>();

    // Seed personas (6 BRD roles + the new SYSADMIN)
    (personaRepo as any).__store.push(
      { id: 'p-office',         code: 'OFFICE',         nameEn: 'Office',                   nameAr: 'مكتب' },
      { id: 'p-senior-admin',   code: 'SENIOR_ADMIN',   nameEn: 'FAD Senior Administrator', nameAr: 'كبير الإداريين' },
      { id: 'p-senior-officer', code: 'SENIOR_OFFICER', nameEn: 'FAD Senior Officer',       nameAr: 'كبير الموظفين' },
      { id: 'p-director',       code: 'DIRECTOR',       nameEn: 'FAD Director',             nameAr: 'مدير الإدارة' },
      { id: 'p-typist',         code: 'TYPIST',         nameEn: 'FAD Typist',               nameAr: 'كاتب الإدارة' },
      { id: 'p-embassy',        code: 'EMBASSY',        nameEn: 'Embassy',                  nameAr: 'السفارة' },
      { id: 'p-sysadmin',       code: 'SYSADMIN',       nameEn: 'System Administrator',     nameAr: 'مسؤول النظام' },
    );

    // user-service calls auth-service to provision/reset/disable credentials.
    process.env.AUTH_SERVICE_URL = 'http://auth-service:3001';
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    (global as any).fetch = fetchMock;

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Persona), useValue: personaRepo },
        { provide: getRepositoryToken(UserPersona), useValue: upRepo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    it('USER-P-001: creates a user, assigns personas, and provisions a credential', async () => {
      const u = await service.create({
        email: 'new@example.com',
        password: strongPassword,
        fullNameEn: 'New User',
        personaCodes: ['OFFICE'],
      });
      expect(u.email).toBe('new@example.com');
      expect((upRepo as any).__store).toHaveLength(1);
      // Credential provisioned via auth-service internal endpoint
      expect(fetchMock).toHaveBeenCalledWith(
        'http://auth-service:3001/api/internal/credentials',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('USER-N-001: rejects duplicate email', async () => {
      (userRepo as any).__store.push({ id: 'x', email: 'taken@example.com' });
      await expect(
        service.create({ email: 'taken@example.com', password: strongPassword, fullNameEn: 'X', personaCodes: ['OFFICE'] }),
      ).rejects.toThrow(ConflictException);
    });

    it('rolls back the user when credential provisioning fails', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ errorCode: 'CREDENTIAL_EXISTS' }) });
      await expect(
        service.create({ email: 'rollback@example.com', password: strongPassword, fullNameEn: 'R', personaCodes: ['OFFICE'] }),
      ).rejects.toThrow(ConflictException);
      // user row removed
      expect((userRepo as any).__store.find((u: any) => u.email === 'rollback@example.com')).toBeUndefined();
    });

    it('creates a SYSADMIN user', async () => {
      const u = await service.create({
        email: 'sysadmin@fad.local',
        password: strongPassword,
        fullNameEn: 'System Administrator',
        personaCodes: ['SYSADMIN'],
      });
      const link = (upRepo as any).__store.find((up: any) => up.userId === u.id);
      expect(link.personaId).toBe('p-sysadmin');
    });
  });

  describe('list', () => {
    it('returns all users as profiles', async () => {
      (userRepo as any).__store.push(
        { id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] },
        { id: 'u2', email: 'd@e.f', fullNameEn: 'D', isActive: false, userPersonas: [] },
      );
      const all = await service.list();
      expect(all).toHaveLength(2);
      expect(all[0]).toHaveProperty('personas');
    });
  });

  describe('update', () => {
    it('updates profile fields', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] });
      const u = await service.update('u1', { fullNameEn: 'Renamed' });
      expect(u.fullNameEn).toBe('Renamed');
    });

    it('syncs login status to auth-service when isActive changes', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] });
      await service.update('u1', { isActive: false });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://auth-service:3001/api/internal/credentials/status',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('does NOT call auth-service when active status is unchanged', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] });
      await service.update('u1', { fullNameEn: 'Same Active' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('replaces personas', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] });
      (upRepo as any).__store.push({ userId: 'u1', personaId: 'p-office' });
      await service.update('u1', { personaCodes: ['DIRECTOR', 'TYPIST'] });
      const links = (upRepo as any).__store.filter((up: any) => up.userId === 'u1');
      expect(links.map((l: any) => l.personaId).sort()).toEqual(['p-director', 'p-typist']);
    });

    it('rejects empty persona set', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] });
      await expect(service.update('u1', { personaCodes: [] })).rejects.toThrow(ConflictException);
    });

    it('rejects unknown persona codes', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] });
      await expect(service.update('u1', { personaCodes: ['NOPE'] })).rejects.toThrow(ConflictException);
    });

    it('throws when the user does not exist', async () => {
      await expect(service.update('missing', { fullNameEn: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetPassword', () => {
    it('calls auth-service to reset the password', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', isActive: true, userPersonas: [] });
      await service.resetPassword('u1', strongPassword);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://auth-service:3001/api/internal/credentials/reset',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when the user does not exist', async () => {
      await expect(service.resetPassword('missing', strongPassword)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('throws when not found', async () => {
      await expect(service.findById('does-not-exist')).rejects.toThrow(NotFoundException);
    });

    it('returns user when found', async () => {
      (userRepo as any).__store.push({ id: 'u1', email: 'a@b.c', fullNameEn: 'A', userPersonas: [] });
      const u = await service.findById('u1');
      expect(u.id).toBe('u1');
    });
  });
});
