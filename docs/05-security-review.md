# 05. Security Review

Security posture for the Visa Management System. Aligned to **OWASP Top 10 2021** and the challenge's review requirements (access control, secure API handling, input validation, sensitive data protection, internal policy compliance).

The BRD cover sheet classifies this work as **Confidential**. Visa data includes passport copies, Emirates IDs, NOCs — high-sensitivity personal data subject to HHRC and local privacy regulations.

---

## A01 — Broken Access Control

**Risk:** Office A reads/edits Office B's visa requests; Office user invokes Director actions.

**Controls:**
- Every protected endpoint uses `@UseGuards(JwtAuthGuard, PersonaGuard)`.
- `PersonaGuard` reads `@RequirePersona(...)` decorator; rejects if user lacks any required persona.
- Object-level authorization: `request-service` filters list queries by `office_id = user.officeId` for OFFICE persona; FAD personas filter by current_assignee or open assignment.
- Workflow transitions check both legal-from-current-state AND actor-has-allowed-persona before any DB write.
- Return **404** (not 403) for unauthorized object access so existence is not leaked.

**Tests:** AUTH-S-001..007, REQ-S-001..003, WF-N-002

---

## A02 — Cryptographic Failures

**Risk:** Plaintext passwords, weak hashing, tokens leaked, sensitive data in logs.

**Controls:**
- Passwords: bcrypt cost 12. Never logged. Never in responses.
- Refresh tokens: SHA-256 hashed in DB; plaintext shown to client once.
- JWT secret: ≥ 64-char random, loaded from env (never hardcoded). Rotated quarterly.
- TLS termination at gateway in production (out of scope for local docker-compose).
- Document bytes: SHA-256 computed on upload, verified on download.
- Sensitive fields (passport number, Emirates ID) flagged in DTO; logger redacts them.
- Database connection uses SCRAM-SHA-256.

**To-do for production:** at-rest encryption (Postgres TDE or filesystem-level); KMS-backed JWT secret rotation.

---

## A03 — Injection

**Risk:** SQL, NoSQL, command, log injection.

**Controls:**
- TypeORM with parameterized queries everywhere. No string-concatenation of user input into SQL.
- Input validation via `class-validator` on every DTO — type, format, length, enum, regex.
- Output encoding: React UI escapes by default; explicit `dangerouslySetInnerHTML` is forbidden in this codebase.
- Email bodies: rendered with template engine; user-supplied content escaped before substitution.
- Log injection: structured logging (JSON); CRLF stripped from user-supplied log fields.

**Tests:** AUTH-S-001, NOTIF-S-001

---

## A04 — Insecure Design

**Risk:** Workflow can be skipped; mass-assignment; missing rate limiting.

**Controls:**
- Workflow state machine is a pure function with explicit transitions — illegal transitions impossible by construction.
- DTOs use whitelist (`forbidNonWhitelisted: true`) — unknown fields rejected.
- Rate limiting at gateway: 100 req/min per IP, 10 req/min for `/auth/login` per email.
- Account lockout: 5 failed login attempts → 15-min lock.
- Comments required for return/apologize/reject ensures audit trail has context.

---

## A05 — Security Misconfiguration

**Controls:**
- All defaults overridable via env; `.env.example` is committed, `.env` is gitignored.
- No debug endpoints, no Swagger in production (gated on `NODE_ENV !== 'production'`).
- Helmet middleware on every service: HSTS, X-Frame-Options, X-Content-Type-Options, CSP.
- CORS allowlist (single frontend origin), not `*`.
- Postgres listens only on the docker network (port published for dev only — close in prod).
- MinIO bucket `anonymous policy: none`.
- Stack traces never returned to clients.

---

## A06 — Vulnerable and Outdated Components

**Controls:**
- All deps pinned in `package-lock.json`.
- `npm audit` in CI; fail build on high/critical.
- Renovate / Dependabot for automated PRs.
- Base images: `node:20-alpine`, `postgres:16-alpine`, `redis:7-alpine`, `minio:latest` (pin in prod).
- No unmaintained packages.

---

## A07 — Identification and Authentication Failures

**Controls:**
- JWT access token lifetime: 15 min. Refresh: 7 days.
- Refresh tokens rotate on use; old one revoked.
- Refresh tokens bound to user-agent + IP (mismatch → revoke + force re-login).
- Password policy: ≥ 12 chars, mixed case, digit, symbol. Enforced on change-password.
- No password recovery via security questions (use OTP/email in production).
- Generic error messages — no user enumeration.

---

## A08 — Software and Data Integrity

**Controls:**
- Documents: SHA-256 stored at upload; verifiable on read.
- Audit log: append-only; in production, remove UPDATE/DELETE grants on `workflow.audit_events`.
- Container images: signed builds in production CI (cosign).
- Refresh tokens stored hashed: even DB compromise doesn't yield live sessions.

---

## A09 — Security Logging and Monitoring

**Controls:**
- Every auth event: `auth.login_audit` (success and failure with IP + UA).
- Every state change: `workflow.transitions` + `workflow.audit_events`.
- Every email: `notifications.emails`.
- Document operations: workflow.audit_events with event_type DOCUMENT_UPLOADED / DOCUMENT_DOWNLOADED.
- Structured JSON logs to stdout; shipped to log aggregator in prod (Loki / ELK / CloudWatch).
- Alerts on: 5 failed logins in 5 min for one email; 10 rejected JWT in 1 min for one IP; account lockout; any 5xx burst.

---

## A10 — Server-Side Request Forgery

**Controls:**
- No endpoint accepts an arbitrary URL.
- Inter-service calls use hardcoded service URLs from env.
- If we add URL-based features later (e.g., callbacks), allowlist + DNS resolution check.

---

## Defense in depth — additional controls

### Input validation
- `class-validator` decorators on every DTO field.
- Whitelist mode rejects unknown fields.
- Max payload size: 50 KB for JSON, 25 MB per file upload, 100 MB per request.
- Multipart parsing limits enforced.

### File upload hardening
- MIME type allowlist per `document_kind`.
- Magic-byte sniff to confirm declared MIME matches actual content.
- Filenames sanitized; storage key derived server-side.
- Antivirus hook stub in `document-service` — wire ClamAV in production.

### Secrets management
- Dev: `.env` file, gitignored.
- Prod: Docker secrets / Kubernetes secrets / cloud KMS.
- Application loads via env vars only; no hard-coded secrets allowed (CI grep check).

### Database
- Per-schema least-privilege users in production (each service has its own DB user with grants only on its schema).
- Connection pooling with bounded size.
- Slow query log enabled.
- Backups: daily encrypted, 30-day retention, separate region.

### Bilingual handling
- All user-facing strings translated server-side via `Accept-Language` header.
- Right-to-left layout enforced in frontend when Arabic selected.

### HHRC compliance specifics
- Confidential classification banner on every UI page (BRD cover requirement).
- Audit log retention: 7 years minimum.
- Data residency: Postgres + MinIO deployed in-region (per org policy).
- Export controls: bulk export of requests requires DIRECTOR approval (Phase 2).
- Data subject erasure requests: documented procedure in operations runbook.

---

## Pre-deployment checklist

Use this before any environment promotion:

- [ ] `JWT_SECRET` rotated and ≥ 64 chars random
- [ ] All default passwords in `.env.example` changed
- [ ] `NODE_ENV=production`
- [ ] Swagger disabled in non-dev
- [ ] CORS origin set to actual frontend URL
- [ ] TLS termination configured at ingress
- [ ] Postgres port not exposed to internet
- [ ] MinIO console not exposed to internet
- [ ] Audit log `REVOKE UPDATE, DELETE` applied
- [ ] `npm audit` clean (high/critical = 0)
- [ ] Container images scanned (Trivy / Snyk)
- [ ] Backup job tested via restore
- [ ] Monitoring alerts configured and tested
- [ ] Incident response runbook published
- [ ] Pen test scheduled annually

---

## Known limitations of the current scaffold

These are documented gaps to address before production:

1. **No 2FA** — Add TOTP for FAD personas at minimum.
2. **No CSRF tokens on state-changing API calls** — Mitigated by JWT-in-Authorization-header pattern (not in cookie), but add anti-CSRF in defense-in-depth.
3. **No antivirus scan on upload** — Stub exists; wire ClamAV.
4. **No DLP on document downloads** — Add watermarking with user ID for sensitive doc kinds.
5. **No request signing between services** — JWT is sufficient for now; consider mTLS in production.
6. **No PII redaction in logs by default** — manual flagging; move to automatic field-level redaction.
