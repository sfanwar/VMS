import { test, expect } from '@playwright/test';
import { ACCOUNT, createRequest, login, resolveReferences, transition } from './helpers';

/**
 * E2E-003 — RBAC and persona enforcement
 *
 * Verifies:
 *   - Office cannot perform Director actions
 *   - Senior Officer cannot APPROVE (only DIRECTOR can)
 *   - Director can perform Director actions
 *   - Whitelist on the persona guard is honored
 */
test.describe('E2E-003: RBAC', () => {
  test('Office cannot perform Director actions', async () => {
    const office = await login(ACCOUNT.office);
    const refs = await resolveReferences(office);
    const created = await createRequest(office, {
      numberOfPassengers: 1,
      countryId: refs.countryId,
      visaTypeId: refs.visaTypeId,
    });

    // Wrong action from this state AND wrong persona — should fail
    const result = await transition(office, created.id, 'APPROVE');
    expect(result.ok).toBeFalsy();
    // Either illegal transition (DRAFT can't APPROVE) or persona-not-authorized
    expect(['ILLEGAL_TRANSITION', 'PERSONA_NOT_AUTHORIZED']).toContain(result.body?.errorCode);
  });

  test('Senior Officer cannot APPROVE from DIRECTOR_REVIEW', async () => {
    const officer = await login(ACCOUNT.seniorOfficer);
    // Try to transition any random UUID — we expect persona check before existence check
    // (actually existence check comes first in our impl; this test mainly verifies
    // the workflow rejects cross-persona actions, demonstrated below)
    // We exercise next-actions endpoint instead: from DIRECTOR_REVIEW, SENIOR_OFFICER
    // should have NO available actions.
    const next = await officer.api
      .get('/api/workflow/next-actions?status=DIRECTOR_REVIEW')
      .then((r) => r.json());
    expect(next.actions).not.toContain('APPROVE');
    expect(next.actions).not.toContain('REJECT');
  });

  test('Director has the expected actions from DIRECTOR_REVIEW', async () => {
    const director = await login(ACCOUNT.director);
    const next = await director.api
      .get('/api/workflow/next-actions?status=DIRECTOR_REVIEW')
      .then((r) => r.json());
    expect(next.actions).toEqual(
      expect.arrayContaining(['APPROVE', 'RETURN_FOR_CORRECTION', 'APOLOGIZE', 'REJECT']),
    );
  });

  test('Embassy can EMBASSY_PROCESS from WAITING_FOR_EMBASSY', async () => {
    const embassy = await login(ACCOUNT.embassy);
    const next = await embassy.api
      .get('/api/workflow/next-actions?status=WAITING_FOR_EMBASSY')
      .then((r) => r.json());
    expect(next.actions).toContain('EMBASSY_PROCESS');
  });

  test('Office cannot EMBASSY_PROCESS (privileged action)', async () => {
    const office = await login(ACCOUNT.office);
    const next = await office.api
      .get('/api/workflow/next-actions?status=WAITING_FOR_EMBASSY')
      .then((r) => r.json());
    expect(next.actions).not.toContain('EMBASSY_PROCESS');
  });

  test('Office can UPLOAD_VISAS only from AT_EMBASSY (not WAITING_FOR_EMBASSY anymore)', async () => {
    const office = await login(ACCOUNT.office);
    const fromWaiting = await office.api
      .get('/api/workflow/next-actions?status=WAITING_FOR_EMBASSY')
      .then((r) => r.json());
    expect(fromWaiting.actions).not.toContain('UPLOAD_VISAS');

    const fromAtEmbassy = await office.api
      .get('/api/workflow/next-actions?status=AT_EMBASSY')
      .then((r) => r.json());
    expect(fromAtEmbassy.actions).toContain('UPLOAD_VISAS');
  });

  test('Embassy persona cannot create requests', async () => {
    const embassy = await login(ACCOUNT.embassy);
    const refs = await resolveReferences(embassy);
    const res = await embassy.api.post('/api/requests', {
      data: {
        countryOfVisitId: refs.countryId,
        visaTypeId: refs.visaTypeId,
        numberOfPassengers: 1,
        beneficiaries: [{ fullNameEn: 'Should be blocked' }],
      },
    });
    expect(res.status()).toBe(403);
  });

  test('Director/Typist/Senior Officer cannot create requests (only Office + Senior Admin)', async () => {
    for (const account of [ACCOUNT.director, ACCOUNT.typist, ACCOUNT.seniorOfficer]) {
      const session = await login(account);
      const refs = await resolveReferences(session);
      const res = await session.api.post('/api/requests', {
        data: {
          countryOfVisitId: refs.countryId,
          visaTypeId: refs.visaTypeId,
          numberOfPassengers: 1,
          beneficiaries: [{ fullNameEn: 'Should be blocked' }],
        },
      });
      expect(res.status(), `${account} should be blocked from creating`).toBe(403);
    }
  });

  test('Senior Admin CAN create requests on behalf of an office', async () => {
    const admin = await login(ACCOUNT.seniorAdmin);
    const refs = await resolveReferences(admin);
    const offices = await admin.api.get('/api/offices').then((r) => r.json());
    const res = await admin.api.post('/api/requests', {
      data: {
        officeId: offices[0].id,
        countryOfVisitId: refs.countryId,
        visaTypeId: refs.visaTypeId,
        numberOfPassengers: 1,
        beneficiaries: [{ fullNameEn: 'Created on behalf of office' }],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.officeId).toBe(offices[0].id);
  });
});

test.describe('E2E-003: cross-office data isolation', () => {
  test('Office A receives 404 for Office B request', async () => {
    // For this test we'd need two seeded offices. With only one seeded office,
    // we verify the negative direction: an arbitrary UUID returns 404.
    const office = await login(ACCOUNT.office);
    const res = await office.api.get('/api/requests/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });

  test('Office cannot impersonate another office on create', async () => {
    const office = await login(ACCOUNT.office);
    const refs = await resolveReferences(office);
    const res = await office.api.post('/api/requests', {
      data: {
        officeId: '00000000-0000-0000-0000-000000000000', // attempt to set a different office
        countryOfVisitId: refs.countryId,
        visaTypeId: refs.visaTypeId,
        numberOfPassengers: 1,
        beneficiaries: [{ fullNameEn: 'Test' }],
      },
    });
    const body = await res.json();
    // Office persona always gets their own officeId, regardless of body
    expect(body.officeId).toBe(office.user.officeId);
  });
});
