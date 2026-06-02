import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../entities/user.entity';
import { Persona, UserPersona } from '../entities/user-persona.entity';

export interface CreateUserData {
  email: string;
  password: string;
  fullNameEn: string;
  fullNameAr?: string;
  officeId?: string;
  personaCodes: string[];
}

export interface UpdateUserData {
  fullNameEn?: string;
  fullNameAr?: string;
  officeId?: string | null;
  isActive?: boolean;
  personaCodes?: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr?: string;
  officeId?: string;
  isActive: boolean;
  createdAt?: Date;
  personas: { code: string; nameEn: string; nameAr: string }[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Persona) private readonly personas: Repository<Persona>,
    @InjectRepository(UserPersona) private readonly userPersonas: Repository<UserPersona>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id }, relations: ['office', 'userPersonas', 'userPersonas.persona'] });
    if (!user) throw new NotFoundException({ errorCode: 'USER_NOT_FOUND', message: 'User not found' });
    return user;
  }

  /** Shape a User entity into the public profile used across the API. */
  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      fullNameEn: user.fullNameEn,
      fullNameAr: user.fullNameAr,
      officeId: user.officeId,
      isActive: user.isActive,
      createdAt: user.createdAt,
      personas: user.userPersonas?.map((up) => ({
        code: up.persona.code,
        nameEn: up.persona.nameEn,
        nameAr: up.persona.nameAr,
      })) ?? [],
    };
  }

  async findByIdWithPersonas(id: string): Promise<UserProfile> {
    return this.toProfile(await this.findById(id));
  }

  /** List every user with personas — for the admin Users screen. */
  async list(): Promise<UserProfile[]> {
    const users = await this.users.find({
      relations: ['office', 'userPersonas', 'userPersonas.persona'],
      order: { createdAt: 'ASC' },
    });
    return users.map((u) => this.toProfile(u));
  }

  async create(data: CreateUserData): Promise<UserProfile> {
    const existing = await this.users.findOne({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException({ errorCode: 'EMAIL_TAKEN', message: 'Email already in use' });
    }

    const user = this.users.create({
      email: data.email,
      fullNameEn: data.fullNameEn,
      fullNameAr: data.fullNameAr ?? undefined,
      officeId: data.officeId ?? undefined,
    });
    const saved = await this.users.save(user);

    // Assign personas and provision login credentials. If either fails, remove
    // the just-created user so we never leave a user that cannot log in or that
    // has no role (the persona/credential rows cascade-delete with the user).
    try {
      await this.assignPersonas(saved.id, data.personaCodes, { replace: false });
      await this.postToAuth('/api/internal/credentials', { userId: saved.id, email: data.email, password: data.password });
    } catch (err) {
      await this.users.delete({ id: saved.id });
      throw err;
    }

    return this.findByIdWithPersonas(saved.id);
  }

  /** Update profile fields, personas, and/or active status (admin). */
  async update(id: string, data: UpdateUserData): Promise<UserProfile> {
    const user = await this.findById(id);

    if (data.fullNameEn !== undefined) user.fullNameEn = data.fullNameEn;
    if (data.fullNameAr !== undefined) user.fullNameAr = data.fullNameAr || undefined;
    if (data.officeId !== undefined) user.officeId = data.officeId || undefined;

    const statusChanged = data.isActive !== undefined && data.isActive !== user.isActive;
    if (statusChanged) user.isActive = data.isActive!;

    await this.users.save(user);

    if (data.personaCodes) {
      await this.assignPersonas(id, data.personaCodes, { replace: true });
    }

    // Keep the login credential's active flag in sync so a disabled user can't
    // log in (auth-service checks credentials.is_active, not users.is_active).
    if (statusChanged) {
      await this.postToAuth('/api/internal/credentials/status', { userId: id, isActive: data.isActive });
    }

    return this.findByIdWithPersonas(id);
  }

  /** Administratively reset a user's password via auth-service. */
  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.findById(id); // 404 if the user doesn't exist
    await this.postToAuth('/api/internal/credentials/reset', { userId: id, password: newPassword });
  }

  async listPersonas(): Promise<Persona[]> {
    return this.personas.find({ order: { nameEn: 'ASC' } });
  }

  /** Validate persona codes and (re)assign them to a user. */
  private async assignPersonas(userId: string, codes: string[], opts: { replace: boolean }): Promise<void> {
    if (!codes || codes.length === 0) {
      if (opts.replace) {
        throw new ConflictException({ errorCode: 'NO_PERSONAS', message: 'A user must have at least one persona' });
      }
      return;
    }
    const personas = await this.personas.find({ where: { code: In(codes) } });
    if (personas.length !== codes.length) {
      const found = personas.map((p) => p.code);
      const missing = codes.filter((c) => !found.includes(c));
      throw new ConflictException({ errorCode: 'UNKNOWN_PERSONA', message: `Unknown persona codes: ${missing.join(', ')}` });
    }
    if (opts.replace) await this.userPersonas.delete({ userId });
    await this.userPersonas.save(personas.map((p) => this.userPersonas.create({ userId, personaId: p.id })));
  }

  /** POST to an auth-service internal endpoint with the shared internal key. */
  private async postToAuth(path: string, body: Record<string, unknown>): Promise<void> {
    const authUrl = process.env.AUTH_SERVICE_URL;
    if (!authUrl) {
      throw new ServiceUnavailableException({ errorCode: 'AUTH_SERVICE_UNCONFIGURED', message: 'AUTH_SERVICE_URL is not configured' });
    }
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(`${authUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`Failed to reach auth-service at ${path}`, err as Error);
      throw new ServiceUnavailableException({ errorCode: 'AUTH_SERVICE_UNREACHABLE', message: 'Could not reach the authentication service' });
    }
    if (!res.ok) {
      const respBody = await res.json().catch(() => ({}));
      this.logger.error(`auth-service rejected ${path} (${res.status})`);
      throw new ConflictException({
        errorCode: (respBody as any)?.errorCode ?? 'AUTH_OPERATION_FAILED',
        message: (respBody as any)?.message ?? 'Authentication service operation failed',
      });
    }
  }
}
