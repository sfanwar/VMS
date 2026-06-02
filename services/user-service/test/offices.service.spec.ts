import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OfficesService } from '../src/offices/offices.service';
import { Office } from '../src/entities/office.entity';
import { OfficeContact } from '../src/entities/office-contact.entity';
import { NotFoundException } from '@nestjs/common';

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
    update: jest.fn(async (criteria: any, partial: any) => {
      let affected = 0;
      for (const s of store) {
        if (Object.entries(criteria).every(([k, v]) => s[k] === v)) { Object.assign(s, partial); affected++; }
      }
      return { affected };
    }),
    delete: jest.fn(async (criteria: any) => {
      let affected = 0;
      for (let i = store.length - 1; i >= 0; i--) {
        if (Object.entries(criteria).every(([k, v]) => store[i][k] === v)) { store.splice(i, 1); affected++; }
      }
      return { affected };
    }),
    create: jest.fn((e: any) => ({ isActive: true, isPrimary: false, ...e })),
    __store: store,
  };
}

describe('OfficesService', () => {
  let service: OfficesService;
  let officeRepo: any;
  let contactRepo: any;

  beforeEach(async () => {
    officeRepo = mockRepo();
    contactRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        OfficesService,
        { provide: getRepositoryToken(Office), useValue: officeRepo },
        { provide: getRepositoryToken(OfficeContact), useValue: contactRepo },
      ],
    }).compile();
    service = module.get(OfficesService);
  });

  describe('create', () => {
    it('mirrors the authorized person into a primary contact', async () => {
      await service.create({ nameEn: 'Office One', nameAr: 'الأول', authorizedPerson: 'Ahmed', telephoneNumber: '+971-4-1' } as any);
      expect(contactRepo.__store).toHaveLength(1);
      expect(contactRepo.__store[0]).toMatchObject({ name: 'Ahmed', isPrimary: true });
    });
  });

  describe('update', () => {
    it('updates office fields', async () => {
      officeRepo.__store.push({ id: 'o1', nameEn: 'Old', nameAr: 'قديم', isActive: true });
      const o = await service.update('o1', { nameEn: 'New' } as any);
      expect(o.nameEn).toBe('New');
    });

    it('throws for an unknown office', async () => {
      await expect(service.update('missing', { nameEn: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('contacts', () => {
    beforeEach(() => {
      officeRepo.__store.push({ id: 'o1', nameEn: 'Office One', nameAr: 'الأول', isActive: true });
      contactRepo.__store.push({ id: 'c1', officeId: 'o1', name: 'Primary', telephoneNumber: '+1', isPrimary: true, isActive: true });
    });

    it('adding a primary contact demotes the existing primary', async () => {
      await service.addContact('o1', { name: 'Second', telephoneNumber: '+2', isPrimary: true });
      const old = contactRepo.__store.find((c: any) => c.id === 'c1');
      const added = contactRepo.__store.find((c: any) => c.name === 'Second');
      expect(old.isPrimary).toBe(false);
      expect(added.isPrimary).toBe(true);
    });

    it('adding a non-primary contact keeps the existing primary', async () => {
      await service.addContact('o1', { name: 'Second', telephoneNumber: '+2' });
      expect(contactRepo.__store.find((c: any) => c.id === 'c1').isPrimary).toBe(true);
    });

    it('rejects adding a contact to an unknown office', async () => {
      await expect(service.addContact('nope', { name: 'X', telephoneNumber: '+9' })).rejects.toThrow(NotFoundException);
    });

    it('updateContact can rename', async () => {
      await service.updateContact('o1', 'c1', { name: 'Renamed' });
      expect(contactRepo.__store.find((c: any) => c.id === 'c1').name).toBe('Renamed');
    });

    it('updateContact throws for unknown contact', async () => {
      await expect(service.updateContact('o1', 'nope', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('removeContact deletes the row', async () => {
      await service.removeContact('o1', 'c1');
      expect(contactRepo.__store.find((c: any) => c.id === 'c1')).toBeUndefined();
    });
  });
});
