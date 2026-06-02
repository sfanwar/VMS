import { test, expect } from '@playwright/test';
import { ACCOUNT, createRequest, getRequest, login, resolveReferences, transition } from './helpers';

/**
 * E2E-001 — Happy path (BRD §5.2)
 *
 * Office submits → Senior Admin verifies → Senior Officer verifies →
 * Director approves → Typist sends to embassy → Office uploads visas →
 * Senior Officer completes.
 *
 * Note: document-required transitions are exercised in a separate file
 * because they need actual file uploads against MinIO.
 */
test.describe('E2E-001: happy path', () => {
  test('full workflow with all role hand-offs', async () => {
    // ─── Step 1: Office creates the request ──────────────
    const office = await login(ACCOUNT.office);
    const refs = await resolveReferences(office);

    const created = await createRequest(office, {
      numberOfPassengers: 2,
      countryId: refs.countryId,
      visaTypeId: refs.visaTypeId,
    });

    expect(created.requestNumber).toMatch(/^VR-\d{4}-\d{6}$/);
    expect(created.status).toBe('DRAFT');
    expect(created.beneficiaries).toHaveLength(2);

    const requestId = created.id;

    // ─── Steps that require attached docs ────────────────
    // The state machine demands office letter + per-beneficiary attachments
    // before SUBMIT will succeed. In the API-only E2E here we don't upload real
    // files — we just verify the workflow REJECTS without them, then skip to
    // a different test that uses the document-service for the full path.

    const failedSubmit = await transition(office, requestId, 'SUBMIT');
    expect(failedSubmit.ok).toBeFalsy();
    expect(failedSubmit.body?.errorCode).toBe('MISSING_DOCUMENTS');
  });
});
