import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequestsService } from '../src/requests/requests.service';
import { VisaRequest } from '../src/entities/visa-request.entity';
import { Beneficiary } from '../src/entities/beneficiary.entity';

function mockRepo() {
  const store: any[] = [];
  return {
    create: jest.fn((e: any) => e),
    save: jest.fn(async (e: any) => {
      if (Array.isArray(e)) { store.push(...e); return e; }
      if (!e.id) e.id = `id-${store.length + 1}`;
      const existing = store.find((s) => s.id === e.id);
      if (existing) Object.assign(existing, e);
      else store.push(e);
      return e;
    }),
    findOne: jest.fn(async (opts: any) => {
      return store.find((s: any) =>
        Object.entries(opts.where).every(([k, v]) => s[k] === v),
      ) ?? null;
    }),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [store, store.length]),
    })),
    __store: store,
  };
}

describe('RequestsService', () => {
  let service: RequestsService;
  let reqRepo: any;
  let benRepo: any;
  let ds: any;

  const officeActor = {
    id: 'user-office',
    email: 'o@e.c',
    personas: ['OFFICE'],
    officeId: 'office-1',
  };
  const adminActor = {
    id: 'user-admin',
    email: 'a@e.c',
    personas: ['SENIOR_ADMIN'],
  };

  beforeEach(async () => {
    reqRepo = mockRepo();
    benRepo = mockRepo();
    ds = { query: jest.fn(async () => [{ next_request_number: 'VR-2026-001001' }]) };

    const module = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(VisaRequest), useValue: reqRepo },
        { provide: getRepositoryToken(Beneficiary), useValue: benRepo },
        { provide: getDataSourceToken(), useValue: ds },
      ],
    }).compile();

    service = module.get(RequestsService);
  });

  const validDto = {
    countryOfVisitId: '11111111-1111-1111-1111-111111111111',
    visaTypeId: '22222222-2222-2222-2222-222222222222',
    numberOfPassengers: 2,
    beneficiaries: [
      { fullNameEn: 'Alice' },
      { fullNameEn: 'Bob' },
    ],
  } as any;

  describe('create', () => {
    it('REQ-P-001: Office user creates a draft request', async () => {
      const r = await service.create(validDto, officeActor as any);
      expect(r.requestNumber).toBe('VR-2026-001001');
      expect(r.status).toBe('DRAFT');
      expect(r.officeId).toBe('office-1');
      expect(r.createdByUserId).toBe('user-office');
    });

    it('REQ-V-004: rejects when beneficiary count does not match', async () => {
      const bad = { ...validDto, numberOfPassengers: 3 };
      await expect(service.create(bad, officeActor as any)).rejects.toThrow(ConflictException);
    });

    it('Office user is locked to their own office (submitted officeId is ignored)', async () => {
      const withOtherOffice = { ...validDto, officeId: 'office-2' };
      const r = await service.create(withOtherOffice, officeActor as any);
      expect(r.officeId).toBe('office-1'); // forced to own office, not 'office-2'
    });

    it('Office user uses their own office when none provided', async () => {
      const noOffice = { ...validDto };
      delete (noOffice as any).officeId;
      const r = await service.create(noOffice, officeActor as any);
      expect(r.officeId).toBe('office-1'); // own office
    });

    it('Office user with no assigned office is rejected', async () => {
      const orphanOffice = { id: 'user-orphan', email: 'o@e.c', personas: ['OFFICE'] };
      await expect(service.create(validDto, orphanOffice as any)).rejects.toThrow(ForbiddenException);
    });

    it('Senior Admin must provide officeId when creating', async () => {
      await expect(service.create(validDto, adminActor as any)).rejects.toThrow(ForbiddenException);
    });

    it('Senior Admin can create for any office', async () => {
      const withOffice = { ...validDto, officeId: 'office-99' };
      const r = await service.create(withOffice, adminActor as any);
      expect(r.officeId).toBe('office-99');
    });
  });

  describe('findByIdForActor', () => {
    it('REQ-S-001: Office A gets 404 for Office B request', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-2', beneficiaries: [] });
      await expect(service.findByIdForActor('r1', officeActor as any)).rejects.toThrow(NotFoundException);
    });

    it('Office user can read their own office request', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', beneficiaries: [] });
      const r = await service.findByIdForActor('r1', officeActor as any);
      expect(r.id).toBe('r1');
    });

    it('Senior Admin can read any request', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-X', beneficiaries: [] });
      const r = await service.findByIdForActor('r1', adminActor as any);
      expect(r.id).toBe('r1');
    });

    // EMBASSY persona visibility — regression test for "Request not found" bug
    describe('EMBASSY persona', () => {
      const embassyActor = {
        id: 'user-embassy',
        email: 'e@embassy.local',
        personas: ['EMBASSY'],
        // No officeId: embassy is an external actor
      };

      it('can read a request at WAITING_FOR_EMBASSY', async () => {
        reqRepo.__store.push({ id: 'r-emb', officeId: 'office-1', status: 'WAITING_FOR_EMBASSY', beneficiaries: [] });
        const r = await service.findByIdForActor('r-emb', embassyActor as any);
        expect(r.id).toBe('r-emb');
      });

      it('can read a request at AT_EMBASSY', async () => {
        reqRepo.__store.push({ id: 'r-emb', officeId: 'office-1', status: 'AT_EMBASSY', beneficiaries: [] });
        const r = await service.findByIdForActor('r-emb', embassyActor as any);
        expect(r.id).toBe('r-emb');
      });

      it('gets 404 for a DRAFT request (pre-embassy)', async () => {
        reqRepo.__store.push({ id: 'r-draft', officeId: 'office-1', status: 'DRAFT', beneficiaries: [] });
        await expect(service.findByIdForActor('r-draft', embassyActor as any)).rejects.toThrow(NotFoundException);
      });

      it('gets 404 for a COMPLETED request (post-embassy)', async () => {
        reqRepo.__store.push({ id: 'r-done', officeId: 'office-1', status: 'COMPLETED', beneficiaries: [] });
        await expect(service.findByIdForActor('r-done', embassyActor as any)).rejects.toThrow(NotFoundException);
      });
    });
  });

  describe('update', () => {
    it('REQ-N-001: cannot edit COMPLETED request', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', status: 'COMPLETED', beneficiaries: [] });
      await expect(
        service.update('r1', { numberOfPassengers: 5 } as any, officeActor as any),
      ).rejects.toThrow(ConflictException);
    });

    it('can edit DRAFT request', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', status: 'DRAFT', beneficiaries: [] });
      const r = await service.update('r1', { numberOfPassengers: 5 } as any, officeActor as any);
      expect(r.numberOfPassengers).toBe(5);
    });
  });

  describe('updateFees', () => {
    it('rejects if actor is not a Typist', async () => {
      await expect(
        service.updateFees('r1', { feesAmount: '500' } as any, officeActor as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a Senior Officer (fee editing is Typist-only)', async () => {
      const seniorOfficer = { id: 'u-so', email: 'so@e.c', personas: ['SENIOR_OFFICER'] };
      await expect(
        service.updateFees('r1', { feesAmount: '500' } as any, seniorOfficer as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Typist can update fees', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', status: 'TYPIST_PROCESSING', beneficiaries: [] });
      const typistActor = { id: 'u-t', email: 't@e.c', personas: ['TYPIST'] };
      const r = await service.updateFees('r1', { feesAmount: '500', feesCurrency: 'AED' } as any, typistActor as any);
      expect(r.feesAmount).toBe('500');
      expect(r.feesUpdatedBy).toBe('u-t');
    });
  });

  describe('updateBeneficiaryVisa', () => {
    const typistActor = { id: 'u-t', email: 't@e.c', personas: ['TYPIST'] };

    it('rejects if actor is not a Typist', async () => {
      await expect(
        service.updateBeneficiaryVisa('r1', 'b1', { visaNumber: 'V123' } as any, officeActor as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects editing outside the embassy / fee-update stages', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', status: 'TYPIST_PROCESSING', beneficiaries: [] });
      benRepo.__store.push({ id: 'b1', requestId: 'r1', fullNameEn: 'Alice', sequenceNo: 1 });
      await expect(
        service.updateBeneficiaryVisa('r1', 'b1', { visaNumber: 'V123' } as any, typistActor as any),
      ).rejects.toThrow(ConflictException);
    });

    it('404s when the beneficiary is not on the request', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', status: 'AT_EMBASSY', beneficiaries: [] });
      await expect(
        service.updateBeneficiaryVisa('r1', 'no-such', { visaNumber: 'V123' } as any, typistActor as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('Typist can write visa number, issue date and appointment for a beneficiary', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', status: 'AT_EMBASSY', beneficiaries: [] });
      benRepo.__store.push({ id: 'b1', requestId: 'r1', fullNameEn: 'Alice', sequenceNo: 1 });
      await service.updateBeneficiaryVisa(
        'r1', 'b1',
        { visaNumber: 'V123', visaIssuedAt: '2026-06-01', appointmentAt: '2026-06-10T09:30:00.000Z' } as any,
        typistActor as any,
      );
      const saved = benRepo.__store.find((b: any) => b.id === 'b1');
      expect(saved.visaNumber).toBe('V123');
      expect(saved.visaIssuedAt).toBe('2026-06-01');
      expect(saved.appointmentAt).toBeInstanceOf(Date);
    });

    it('only writes the fields provided (incremental save)', async () => {
      reqRepo.__store.push({ id: 'r1', officeId: 'office-1', status: 'TYPIST_FEE_UPDATE', beneficiaries: [] });
      benRepo.__store.push({ id: 'b1', requestId: 'r1', fullNameEn: 'Alice', sequenceNo: 1, visaNumber: 'OLD' });
      await service.updateBeneficiaryVisa('r1', 'b1', { visaIssuedAt: '2026-06-02' } as any, typistActor as any);
      const saved = benRepo.__store.find((b: any) => b.id === 'b1');
      expect(saved.visaNumber).toBe('OLD'); // untouched
      expect(saved.visaIssuedAt).toBe('2026-06-02');
    });
  });
});
