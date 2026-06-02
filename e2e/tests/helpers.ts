import { APIRequestContext, expect, request } from '@playwright/test';

export interface Session {
  api: APIRequestContext;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    personas: { code: string }[];
    officeId?: string;
  };
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const SEEDED_PASSWORD = 'Passw0rd!';

export const ACCOUNT = {
  office:        'office.user@office1.local',
  seniorAdmin:   'senior.admin@fad.local',
  seniorOfficer: 'senior.officer@fad.local',
  director:      'director@fad.local',
  typist:        'typist@fad.local',
  embassy:       'embassy.user@embassy.local',
} as const;

export async function login(email: string, password: string = SEEDED_PASSWORD): Promise<Session> {
  const api = await request.newContext({ baseURL: BASE_URL });
  const res = await api.post('/api/auth/login', { data: { email, password } });
  expect(res.ok(), `Login failed for ${email}: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();

  // Build a new context that injects the token automatically
  const authedApi = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${body.accessToken}` },
  });

  return {
    api: authedApi,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    user: body.user,
  };
}

export async function resolveReferences(session: Session) {
  const [countries, visaTypes] = await Promise.all([
    session.api.get('/api/reference/countries').then((r) => r.json()),
    session.api.get('/api/reference/visa-types').then((r) => r.json()),
  ]);
  return {
    countryId: countries[0].id,
    visaTypeId: visaTypes.find((v: any) => v.code === 'TOURIST')?.id ?? visaTypes[0].id,
  };
}

export async function createRequest(session: Session, opts: {
  numberOfPassengers: number;
  countryId: string;
  visaTypeId: string;
}) {
  const res = await session.api.post('/api/requests', {
    data: {
      countryOfVisitId: opts.countryId,
      visaTypeId:       opts.visaTypeId,
      numberOfPassengers: opts.numberOfPassengers,
      beneficiaries: Array.from({ length: opts.numberOfPassengers }, (_, i) => ({
        fullNameEn: `E2E Beneficiary ${i + 1}`,
      })),
    },
  });
  expect(res.ok(), `Create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

export async function transition(session: Session, requestId: string, action: string, comment?: string) {
  const res = await session.api.post('/api/workflow/transitions', {
    data: { requestId, action, comment },
  });
  return { ok: res.ok(), status: res.status(), body: res.ok() ? await res.json() : await res.json().catch(() => null) };
}

export async function getRequest(session: Session, id: string) {
  const res = await session.api.get(`/api/requests/${id}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}
