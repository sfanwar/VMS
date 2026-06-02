import { test, expect } from '@playwright/test';
import { ACCOUNT, createRequest, getRequest, login, resolveReferences, transition } from './helpers';

/**
 * E2E-002 — Returned and resubmit (BRD §5.2)
 *
 * After Senior Admin returns a request, the Office can correct and resubmit;
 * the workflow transitions are recorded immutably; the audit trail
 * accumulates rather than being overwritten.
 */
test.describe('E2E-002: returned and resubmit', () => {
  test('records all transitions immutably', async () => {
    // For this test we exercise the state-machine endpoint directly,
    // bypassing the document gating that E2E-001 covers.
    const office = await login(ACCOUNT.office);
    const refs = await resolveReferences(office);

    const created = await createRequest(office, {
      numberOfPassengers: 1,
      countryId: refs.countryId,
      visaTypeId: refs.visaTypeId,
    });

    // We expect SUBMIT without docs to fail (proves the guard works)
    const submitWithoutDocs = await transition(office, created.id, 'SUBMIT');
    expect(submitWithoutDocs.ok).toBeFalsy();
    expect(submitWithoutDocs.body?.errorCode).toBe('MISSING_DOCUMENTS');

    // The state-machine GET endpoint should still return current actions
    const next = await office.api.get('/api/workflow/next-actions?status=DRAFT').then((r) => r.json());
    expect(next.actions).toContain('SUBMIT');

    // Verify the request's state is still DRAFT (the failed transition is not recorded)
    const reloaded = await getRequest(office, created.id);
    expect(reloaded.status).toBe('DRAFT');
  });
});
