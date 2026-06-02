/**
 * Minimal fetch wrapper:
 * — Injects the JWT access token
 * — Surfaces structured errors as { errorCode, message }
 * — Reads API base from env (set by Vite at build time)
 */

const API_BASE = (import.meta as any).env.VITE_API_BASE ?? 'http://localhost:3000';

export interface ApiError extends Error {
  status: number;
  errorCode: string;
  details?: unknown;
}

function makeError(status: number, body: any): ApiError {
  const err = new Error(body?.message ?? `Request failed (${status})`) as ApiError;
  err.status = status;
  err.errorCode = body?.errorCode ?? 'UNKNOWN';
  err.details = body?.details;
  return err;
}

function getAccessToken(): string | null {
  return sessionStorage.getItem('vms_access_token');
}

export function setAccessToken(token: string | null) {
  if (token) sessionStorage.setItem('vms_access_token', token);
  else sessionStorage.removeItem('vms_access_token');
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem('vms_refresh_token');
}

export function setRefreshToken(token: string | null) {
  if (token) sessionStorage.setItem('vms_refresh_token', token);
  else sessionStorage.removeItem('vms_refresh_token');
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Set to true for multipart uploads (body should be FormData) */
  multipart?: boolean;
  /** Set to true to skip the Authorization header (login/refresh) */
  noAuth?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.multipart) headers['Content-Type'] = 'application/json';

  const token = getAccessToken();
  if (token && !opts.noAuth) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.multipart
      ? (opts.body as FormData)
      : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : undefined,
  });

  if (res.status === 204) return undefined as T;

  // 401 → try refresh once, then retry
  if (res.status === 401 && !opts.noAuth && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api(path, opts);
    }
  }

  let body: any;
  try { body = await res.json(); } catch { body = null; }

  if (!res.ok) throw makeError(res.status, body);
  return body as T;
}

let refreshInFlight: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// ─── Typed API surface ────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr?: string;
  officeId?: string;
  personas: { code: string; nameEn: string; nameAr: string }[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserProfile;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<LoginResponse>('/api/auth/login', { method: 'POST', noAuth: true, body: { email, password } }),
  logout: (refreshToken: string) =>
    api<void>('/api/auth/logout', { method: 'POST', noAuth: true, body: { refreshToken } }),
};

export const userApi = {
  me: () => api<UserProfile>('/api/users/me'),
};

export interface Beneficiary {
  id: string;
  fullNameEn: string;
  fullNameAr?: string;
  passportNumber?: string;
  nationality?: string;
  sequenceNo: number;
  appointmentAt?: string;
  visaNumber?: string;
}

export interface OfficeContact {
  id: string;
  name: string;
  telephoneNumber: string;
  isPrimary: boolean;
}

export interface Office {
  id: string;
  nameEn: string;
  nameAr: string;
  authorizedPerson: string;
  telephoneNumber: string;
  isActive?: boolean;
  contacts?: OfficeContact[];
}

export interface VisaRequest {
  id: string;
  requestNumber: string;
  officeId: string;
  officeContactId?: string;
  countryOfVisitId: string;
  visaTypeId: string;
  numberOfPassengers: number;
  requestDate: string;
  status: string;
  feesAmount?: string;
  feesCurrency?: string;
  createdAt: string;
  beneficiaries?: Beneficiary[];
}

export const requestsApi = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    const qs = q.toString();
    return api<{ items: VisaRequest[]; total: number; page: number; pageSize: number }>(
      `/api/requests${qs ? `?${qs}` : ''}`,
    );
  },
  get: (id: string) => api<VisaRequest>(`/api/requests/${id}`),
  create: (body: any) => api<VisaRequest>('/api/requests', { method: 'POST', body }),
  updateFees: (id: string, feesAmount: number, feesCurrency?: string) =>
    api<VisaRequest>(`/api/requests/${id}/fees`, { method: 'PATCH', body: { feesAmount, feesCurrency } }),
};

export const referenceApi = {
  countries: () => api<{ id: string; isoCode: string; nameEn: string; nameAr: string }[]>('/api/reference/countries'),
  visaTypes: () => api<{ id: string; code: string; nameEn: string; nameAr: string }[]>('/api/reference/visa-types'),
  offices: () => api<Office[]>('/api/offices'),
};

// ─── Admin (SYSADMIN only) ────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr?: string;
  officeId?: string;
  isActive: boolean;
  createdAt?: string;
  personas: { code: string; nameEn: string; nameAr: string }[];
}

export interface Persona {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  description?: string;
  isSystem?: boolean;
}

export interface Country { id: string; isoCode: string; nameEn: string; nameAr: string; isActive: boolean }
export interface VisaTypeRef { id: string; code: string; nameEn: string; nameAr: string; isActive: boolean }

export const adminApi = {
  users: {
    list: () => api<AdminUser[]>('/api/users'),
    create: (body: {
      email: string; password: string; fullNameEn: string; fullNameAr?: string;
      officeId?: string; personaCodes: string[];
    }) => api<AdminUser>('/api/users', { method: 'POST', body }),
    update: (id: string, body: {
      fullNameEn?: string; fullNameAr?: string; officeId?: string; isActive?: boolean; personaCodes?: string[];
    }) => api<AdminUser>(`/api/users/${id}`, { method: 'PATCH', body }),
    resetPassword: (id: string, password: string) =>
      api<{ status: string }>(`/api/users/${id}/reset-password`, { method: 'POST', body: { password } }),
  },
  personas: {
    list: () => api<Persona[]>('/api/personas'),
  },
  offices: {
    listAll: () => api<Office[]>('/api/offices/all'),
    create: (body: { nameEn: string; nameAr: string; authorizedPerson: string; telephoneNumber: string }) =>
      api<Office>('/api/offices', { method: 'POST', body }),
    update: (id: string, body: Partial<{ nameEn: string; nameAr: string; authorizedPerson: string; telephoneNumber: string; isActive: boolean }>) =>
      api<Office>(`/api/offices/${id}`, { method: 'PATCH', body }),
    addContact: (id: string, body: { name: string; telephoneNumber: string; isPrimary?: boolean }) =>
      api<Office>(`/api/offices/${id}/contacts`, { method: 'POST', body }),
    updateContact: (id: string, contactId: string, body: Partial<{ name: string; telephoneNumber: string; isPrimary: boolean; isActive: boolean }>) =>
      api<Office>(`/api/offices/${id}/contacts/${contactId}`, { method: 'PATCH', body }),
    removeContact: (id: string, contactId: string) =>
      api<Office>(`/api/offices/${id}/contacts/${contactId}`, { method: 'DELETE' }),
  },
  reference: {
    countries: (includeInactive = false) =>
      api<Country[]>(`/api/reference/countries${includeInactive ? '?includeInactive=true' : ''}`),
    createCountry: (body: { isoCode: string; nameEn: string; nameAr: string }) =>
      api<Country>('/api/reference/countries', { method: 'POST', body }),
    updateCountry: (id: string, body: Partial<{ nameEn: string; nameAr: string; isActive: boolean }>) =>
      api<Country>(`/api/reference/countries/${id}`, { method: 'PATCH', body }),
    visaTypes: (includeInactive = false) =>
      api<VisaTypeRef[]>(`/api/reference/visa-types${includeInactive ? '?includeInactive=true' : ''}`),
    createVisaType: (body: { code: string; nameEn: string; nameAr: string }) =>
      api<VisaTypeRef>('/api/reference/visa-types', { method: 'POST', body }),
    updateVisaType: (id: string, body: Partial<{ nameEn: string; nameAr: string; isActive: boolean }>) =>
      api<VisaTypeRef>(`/api/reference/visa-types/${id}`, { method: 'PATCH', body }),
  },
};

export const workflowApi = {
  transition: (requestId: string, action: string, comment?: string) =>
    api('/api/workflow/transitions', { method: 'POST', body: { requestId, action, comment } }),
  history: (requestId: string) =>
    api<{
      id: string;
      fromStatus: string | null;
      toStatus: string;
      action: string;
      actorUserId: string;
      actorPersona: string;
      comment?: string;
      occurredAt: string;
    }[]>(`/api/workflow/requests/${requestId}/history`),
  nextActions: (status: string) =>
    api<{ actions: string[] }>(`/api/workflow/next-actions?status=${encodeURIComponent(status)}`),
  stateMachine: () =>
    api<{
      states: string[];
      transitions: { from: string; action: string; to: string; allowedPersonas: string[] }[];
    }>(`/api/workflow/state-machine`),
};

export const documentsApi = {
  list: (requestId: string) =>
    api<{ id: string; kind: string; originalName: string; mimeType: string; sizeBytes: string; uploadedAt: string }[]>(
      `/api/documents?requestId=${encodeURIComponent(requestId)}`,
    ),
  upload: (file: File, requestId: string, kind: string, beneficiaryId?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('requestId', requestId);
    fd.append('kind', kind);
    if (beneficiaryId) fd.append('beneficiaryId', beneficiaryId);
    return api(`/api/documents/upload`, { method: 'POST', multipart: true, body: fd });
  },
  downloadUrl: (id: string) => `${API_BASE}/api/documents/${id}/download`,
  download: async (id: string, filename: string) => {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE}/api/documents/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Download failed (${res.status}): ${body}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
