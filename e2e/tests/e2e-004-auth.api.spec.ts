import { test, expect, request } from '@playwright/test';
import { ACCOUNT, login } from './helpers';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * E2E-004 — Authentication flow
 *
 * Verifies:
 *   - Login issues JWT + refresh
 *   - Wrong password returns 401 with same error as unknown email (no enumeration)
 *   - Refresh rotates tokens; old refresh becomes invalid
 *   - Logout revokes the refresh token
 *   - Calls without Bearer token are rejected
 */
test.describe('E2E-004: auth flow', () => {
  test('successful login returns tokens and personas', async () => {
    const session = await login(ACCOUNT.director);
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user.personas.map((p) => p.code)).toContain('DIRECTOR');
  });

  test('embassy account can log in and carries EMBASSY persona', async () => {
    const session = await login(ACCOUNT.embassy);
    expect(session.user.personas.map((p) => p.code)).toContain('EMBASSY');
    expect(session.user.email).toBe(ACCOUNT.embassy);
  });

  test('all six seeded accounts can log in', async () => {
    for (const email of Object.values(ACCOUNT)) {
      const s = await login(email);
      expect(s.accessToken, `Login should succeed for ${email}`).toBeTruthy();
    }
  });

  test('wrong password returns 401', async () => {
    const api = await request.newContext({ baseURL: BASE_URL });
    const res = await api.post('/api/auth/login', {
      data: { email: ACCOUNT.office, password: 'wrong-password' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  test('unknown email returns the same error code (no enumeration)', async () => {
    const api = await request.newContext({ baseURL: BASE_URL });
    const res = await api.post('/api/auth/login', {
      data: { email: 'nobody@nowhere.local', password: 'whatever' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  test('refresh rotates the refresh token', async () => {
    const session = await login(ACCOUNT.office);
    const oldRefresh = session.refreshToken;

    const api = await request.newContext({ baseURL: BASE_URL });
    const res = await api.post('/api/auth/refresh', { data: { refreshToken: oldRefresh } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.refreshToken).not.toBe(oldRefresh);

    // Old refresh should now be invalid
    const reused = await api.post('/api/auth/refresh', { data: { refreshToken: oldRefresh } });
    expect(reused.status()).toBe(401);
  });

  test('logout revokes the refresh token', async () => {
    const session = await login(ACCOUNT.office);
    const api = await request.newContext({ baseURL: BASE_URL });
    const out = await api.post('/api/auth/logout', { data: { refreshToken: session.refreshToken } });
    expect(out.status()).toBe(204);

    const refreshAttempt = await api.post('/api/auth/refresh', {
      data: { refreshToken: session.refreshToken },
    });
    expect(refreshAttempt.status()).toBe(401);
  });

  test('protected endpoint requires Authorization header', async () => {
    const api = await request.newContext({ baseURL: BASE_URL });
    const res = await api.get('/api/users/me');
    expect(res.status()).toBe(401);
  });

  test('expired/tampered JWT rejected', async () => {
    const api = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: 'Bearer abc.def.invalid' },
    });
    const res = await api.get('/api/users/me');
    expect(res.status()).toBe(401);
  });
});
