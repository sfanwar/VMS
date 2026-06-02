import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReferenceService } from '../src/reference/reference.service';
import { Country, VisaType } from '../src/entities/reference.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';

function mockRepo(): any {
  const store: any[] = [];
  return {
    find: jest.fn(async (opts?: any) => {
      const where = opts?.where ?? {};
      return store.filter((s) => Object.entries(where).every(([k, v]) => s[k] === v));
    }),
    findOne: jest.fn(async (opts: any) =>
      store.find((s) => Object.entries(opts.where).every(([k, v]) => s[k] === v)) ?? null,
    ),
    save: jest.fn(async (entity: any) => {
      if (!entity.id) entity.id = `id-${store.length + 1}`;
      const existing = store.find((s) => s.id === entity.id);
      if (existing) Object.assign(existing, entity);
      else store.push(entity);
      return entity;
    }),
    create: jest.fn((e: any) => ({ isActive: true, ...e })),
    __store: store,
  };
}

describe('ReferenceService', () => {
  let service: ReferenceService;
  let countryRepo: any;
  let visaTypeRepo: any;

  beforeEach(async () => {
    countryRepo = mockRepo();
    visaTypeRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ReferenceService,
        { provide: getRepositoryToken(Country), useValue: countryRepo },
        { provide: getRepositoryToken(VisaType), useValue: visaTypeRepo },
      ],
    }).compile();
    service = module.get(ReferenceService);
  });

  describe('countries', () => {
    it('creates a country and uppercases the ISO code', async () => {
      const c = await service.createCountry({ isoCode: 'es', nameEn: 'Spain', nameAr: 'إسبانيا' });
      expect(c.isoCode).toBe('ES');
    });

    it('rejects a duplicate ISO code', async () => {
      countryRepo.__store.push({ id: 'x', isoCode: 'US', nameEn: 'United States', nameAr: 'أمريكا', isActive: true });
      await expect(service.createCountry({ isoCode: 'us', nameEn: 'Dup', nameAr: 'مكرر' })).rejects.toThrow(ConflictException);
    });

    it('deactivates a country', async () => {
      countryRepo.__store.push({ id: 'c1', isoCode: 'FR', nameEn: 'France', nameAr: 'فرنسا', isActive: true });
      const c = await service.updateCountry('c1', { isActive: false });
      expect(c.isActive).toBe(false);
    });

    it('throws when updating an unknown country', async () => {
      await expect(service.updateCountry('missing', { isActive: false })).rejects.toThrow(NotFoundException);
    });

    it('listCountries excludes inactive by default but includes them on request', async () => {
      countryRepo.__store.push(
        { id: 'a', isoCode: 'AA', nameEn: 'Active', nameAr: 'نشط', isActive: true },
        { id: 'b', isoCode: 'BB', nameEn: 'Inactive', nameAr: 'غير نشط', isActive: false },
      );
      expect(await service.listCountries()).toHaveLength(1);
      expect(await service.listCountries(true)).toHaveLength(2);
    });
  });

  describe('visa types', () => {
    it('creates a visa type and uppercases the code', async () => {
      const v = await service.createVisaType({ code: 'student', nameEn: 'Student', nameAr: 'طالب' });
      expect(v.code).toBe('STUDENT');
    });

    it('rejects a duplicate code', async () => {
      visaTypeRepo.__store.push({ id: 'x', code: 'TOURIST', nameEn: 'Tourist', nameAr: 'سياحة', isActive: true });
      await expect(service.createVisaType({ code: 'tourist', nameEn: 'Dup', nameAr: 'مكرر' })).rejects.toThrow(ConflictException);
    });

    it('deactivates a visa type', async () => {
      visaTypeRepo.__store.push({ id: 'v1', code: 'TRANSIT', nameEn: 'Transit', nameAr: 'عبور', isActive: true });
      const v = await service.updateVisaType('v1', { isActive: false });
      expect(v.isActive).toBe(false);
    });

    it('throws when updating an unknown visa type', async () => {
      await expect(service.updateVisaType('missing', { isActive: false })).rejects.toThrow(NotFoundException);
    });
  });
});
