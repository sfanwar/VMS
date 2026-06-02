# 04. Test Cases

Test cases per the challenge requirement: positive, negative, validation, error handling, and security.

Format: each case has **ID / Type / Pre / Steps / Expected**. Automated tests in `services/*/test/` cover most of these; manual cases noted with **[Manual]**.

---

## Auth service

### Positive

**AUTH-P-001** — Successful login with valid credentials
- Pre: User exists, password is `Passw0rd!`
- Steps: POST `/auth/login` with `{email, password}`
- Expected: 200; response contains `accessToken`, `refreshToken`, `user.personas`

**AUTH-P-002** — Refresh token exchange
- Pre: Logged in, have refresh token
- Steps: POST `/auth/refresh` with refresh token
- Expected: 200; new access token; old refresh token rotated (old one no longer valid)

**AUTH-P-003** — Logout revokes refresh token
- Pre: Logged in
- Steps: POST `/auth/logout` → then POST `/auth/refresh` with same refresh token
- Expected: First call 200; second call 401 with code `REFRESH_TOKEN_REVOKED`

### Negative

**AUTH-N-001** — Wrong password
- Steps: POST `/auth/login` with bad password
- Expected: 401; error code `INVALID_CREDENTIALS`; `failed_logins` incremented

**AUTH-N-002** — Unknown email
- Expected: 401; same error code as wrong password (no user enumeration)

**AUTH-N-003** — Account locked after 5 failed attempts
- Steps: 5× wrong password, then correct password
- Expected: 6th attempt → 423 `ACCOUNT_LOCKED`; lockout for 15 minutes

**AUTH-N-004** — Inactive user cannot log in
- Pre: `is_active = false`
- Expected: 401 `INVALID_CREDENTIALS`

### Validation

**AUTH-V-001** — Email format required
- Steps: POST `/auth/login` with `{email: "not-an-email", password: "x"}`
- Expected: 400 with field-level error on `email`

**AUTH-V-002** — Password minimum length on change-password
- Steps: POST `/auth/change-password` with new password `"abc"`
- Expected: 400; password policy violation

### Security

**AUTH-S-001** — SQL injection in email field
- Steps: POST `/auth/login` with email `"' OR 1=1 --"`
- Expected: 400 validation error; no rows leaked; nothing logged as user PII

**AUTH-S-002** — Password is never returned in API responses
- Steps: Any auth response
- Expected: No field named `password` or `passwordHash` in any response body

**AUTH-S-003** — JWT tampering detected
- Steps: Take valid JWT, modify payload, call protected endpoint
- Expected: 401 invalid signature

**AUTH-S-004** — Expired JWT rejected
- Steps: Use a token past `exp` claim
- Expected: 401 token expired

**AUTH-S-005** — Login audit captures IP and user-agent
- Verify: `auth.login_audit` rows contain `ip_address` and `user_agent`

**AUTH-S-006** — Refresh tokens stored hashed
- Verify: `auth.refresh_tokens.token_hash` ≠ plaintext returned to client

**AUTH-S-007** — Timing-safe password comparison
- Verify: bcrypt.compare used (not string equality)

---

## User & role service

### Positive

**USER-P-001** — Create user as admin
- Steps: POST `/users` with full user payload
- Expected: 201; user row + credential row created atomically

**USER-P-002** — Assign multiple personas
- Steps: POST `/users/:id/personas` with `[SENIOR_OFFICER, DIRECTOR]`
- Expected: 200; both rows in `user_personas`

**USER-P-003** — List offices returns bilingual names
- Steps: GET `/offices`
- Expected: each row has `nameEn` and `nameAr`

### Negative

**USER-N-001** — Duplicate email rejected
- Steps: POST `/users` with already-used email
- Expected: 409 `EMAIL_TAKEN`

**USER-N-002** — Non-admin cannot create users
- Pre: Caller has only OFFICE persona
- Steps: POST `/users`
- Expected: 403 `INSUFFICIENT_PERMISSIONS`

### Validation

**USER-V-001** — Office name required in both languages
- Steps: POST `/offices` with only English name
- Expected: 400; `nameAr` required

**USER-V-002** — Persona code must exist
- Steps: POST `/users/:id/personas` with `["NONEXISTENT"]`
- Expected: 400 `UNKNOWN_PERSONA`

### Security

**USER-S-001** — User cannot escalate their own personas
- Steps: Logged in as OFFICE, POST `/users/me/personas` with `["DIRECTOR"]`
- Expected: 403

**USER-S-002** — Soft-delete preserves audit references
- Steps: Delete a user; check workflow.transitions still resolves their name historically

---

## Request service

### Positive

**REQ-P-001** — Office user creates DRAFT request
- Pre: Logged in as OFFICE
- Steps: POST `/requests` with valid payload
- Expected: 201; `requestNumber` matches `VR-YYYY-NNNNNN`; status = DRAFT; office_id auto-set from user

**REQ-P-002** — Authorized person + telephone auto-populated
- Verify: response contains office's `authorizedPerson` and `telephoneNumber` (BRD §5.2 disabled fields)

**REQ-P-003** — Update DRAFT details
- Steps: PATCH `/requests/:id` with new visa type
- Expected: 200; updated

**REQ-P-004** — Senior Admin creates on behalf of Office
- Pre: Logged in as SENIOR_ADMIN
- Steps: POST `/requests` with `officeId` specified
- Expected: 201; request belongs to that office

**REQ-P-005** — List requests filtered by status
- Steps: GET `/requests?status=DIRECTOR_REVIEW`
- Expected: Only matching requests; RBAC applied (Office sees only own)

### Negative

**REQ-N-001** — Cannot edit a COMPLETED request
- Pre: Status = COMPLETED
- Steps: PATCH `/requests/:id`
- Expected: 409 `REQUEST_LOCKED`

**REQ-N-002** — Cannot delete after submission
- Steps: DELETE `/requests/:id` where status ≠ DRAFT
- Expected: 409

### Validation

**REQ-V-001** — `numberOfPassengers` must be positive integer
- Steps: POST `/requests` with `numberOfPassengers: 0` or `-1` or `1.5`
- Expected: 400

**REQ-V-002** — `countryOfVisitId` must reference existing country
- Steps: POST with random UUID
- Expected: 400 `INVALID_REFERENCE`

**REQ-V-003** — `requestDate` defaults to today, not editable
- Steps: POST with `requestDate: "2020-01-01"`
- Expected: 400 or value silently overridden to today (per BRD §5.2 "disabled field")

**REQ-V-004** — Beneficiary count must equal numberOfPassengers
- Pre: Request with numberOfPassengers=3, 2 beneficiaries
- Steps: Attempt SUBMIT transition
- Expected: 422 `BENEFICIARY_COUNT_MISMATCH`

### Security

**REQ-S-001** — Office A cannot read Office B's request
- Steps: Office A logs in, GET `/requests/:id` (id belongs to Office B)
- Expected: 404 (not 403 — don't leak existence)

**REQ-S-002** — Mass assignment protection
- Steps: POST `/requests` with `{status: "COMPLETED", feesAmount: 0, ...}`
- Expected: status forced to DRAFT, feesAmount ignored (Office cannot set)

**REQ-S-003** — Office cannot update someone else's request even with valid ID
- Expected: 404

---

## Workflow service (state machine)

### Positive — each legal transition

For every row in the transition table in `03-workflow-state-machine.md`, there is a test `WF-P-{from}_{action}` that:
1. Creates a request in `from` state
2. Acts as a user with allowed persona
3. Executes the action
4. Verifies new state, transition row written, audit event emitted

### Negative

**WF-N-001** — Illegal transition rejected
- Pre: status = DRAFT
- Steps: Try action APPROVE
- Expected: 422 `ILLEGAL_TRANSITION`; nothing changed in DB

**WF-N-002** — Wrong persona rejected
- Pre: status = DIRECTOR_REVIEW, actor is SENIOR_OFFICER
- Steps: APPROVE
- Expected: 403 `PERSONA_NOT_AUTHORIZED`

**WF-N-003** — Senior Officer cannot skip Director
- Pre: status = FINAL_VERIFICATION
- Steps: Attempt direct to TYPIST_PROCESSING
- Expected: 422

**WF-N-004** — Comment required on RETURN/APOLOGIZE/REJECT
- Steps: action = RETURN_TO_OFFICE with empty comment
- Expected: 400 `COMMENT_REQUIRED`

### Validation

**WF-V-001** — SUBMIT requires all document types
- Pre: DRAFT, missing EMBASSY_VISA_FORM for one beneficiary
- Expected: 422 `MISSING_DOCUMENTS`

**WF-V-002** — Director APPROVE requires Embassy Letter from prior step
- Verify in test

### Security

**WF-S-001** — Audit event recorded for every transition
- Verify: `workflow.audit_events` has one row per transition

**WF-S-002** — Cannot replay/forge a transition with stale ETag
- Steps: Use optimistic locking (`updated_at` version) — concurrent transition fails

**WF-S-003** — IP and user-agent captured on transition
- Verify in audit row

---

## Document service

### Positive

**DOC-P-001** — Upload PDF, get back metadata
- Steps: POST `/documents/upload` multipart
- Expected: 201; returns id, sha256, sizeBytes; file actually in MinIO

**DOC-P-002** — Download requires auth + ownership
- Steps: GET `/documents/:id/download`
- Expected: 200; correct bytes; content-disposition matches original name

**DOC-P-003** — SHA-256 integrity check
- Steps: Upload, then re-compute hash on download
- Expected: matches stored sha256

**DOC-P-004** — Soft delete keeps audit
- Steps: DELETE doc; query MinIO directly
- Expected: row marked deleted; bytes still in MinIO (purge in retention job)

### Negative / Validation

**DOC-N-001** — Reject non-PDF for OFFICE_LETTER kind
- Steps: Upload .jpg as OFFICE_LETTER
- Expected: 400 `INVALID_MIME_TYPE` (BRD specifies PDF)

**DOC-N-002** — Size limit
- Steps: Upload >25 MB PDF (config)
- Expected: 413 `FILE_TOO_LARGE`

**DOC-N-003** — Missing requestId
- Expected: 400

### Security

**DOC-S-001** — Path traversal in filename neutralized
- Steps: Upload `../../etc/passwd.pdf`
- Expected: Stored under sanitized key; original name kept in DB only

**DOC-S-002** — Cannot download another office's document
- Expected: 404

**DOC-S-003** — MinIO bucket is not publicly readable
- Verify in `docker-compose.yml`: `mc anonymous set none`

**DOC-S-004** — Content-Type sniffing prevented
- Expected: response has `X-Content-Type-Options: nosniff`

**DOC-S-005** — Reject mismatched declared vs actual MIME (magic-byte check)

---

## Notification service

### Positive

**NOTIF-P-001** — Email queued and sent
- Steps: POST `/notifications/email`
- Expected: row in `notifications.emails` with `status=PENDING` → eventually `SENT`; MailHog UI shows it

**NOTIF-P-002** — Custom Actions email with overridden To/CC/Subject/Body
- Steps: POST with custom body
- Expected: Email captured matches custom content

**NOTIF-P-003** — In-app notification appears in user feed

### Negative

**NOTIF-N-001** — Invalid email address rejected
- Steps: To = `not-an-email`
- Expected: 400

**NOTIF-N-002** — Retry on SMTP failure
- Pre: SMTP down
- Expected: `attempts` increments; failed after N retries → status FAILED

### Security

**NOTIF-S-001** — Body sanitized for HTML injection
- Steps: body contains `<script>alert(1)</script>`
- Expected: rendered as text in email, not executed in viewer

**NOTIF-S-002** — Cannot send emails as a different user
- Verify: `sent_by` is always taken from JWT, never from body

**NOTIF-S-003** — Email body cannot include arbitrary external recipients without authorization
- Cross-domain BCC blocked unless caller is DIRECTOR

---

## End-to-end (E2E) scenarios

**E2E-001** — Happy path: Office submits → completed
1. Office logs in, creates request, uploads 4 docs (3 beneficiaries)
2. Senior Admin verifies OK
3. Senior Officer attaches Embassy Letter, verifies OK
4. Director approves
5. Typist uploads visa apps, schedules appointments, updates fees, sends to embassy
6. Office uploads visas
7. Senior Officer completes
- Expected: status = COMPLETED; 8+ rows in `workflow.transitions`; 6+ emails in `notifications.emails`; full audit trail queryable

**E2E-002** — Returned path with resubmission
1. Office submits
2. Senior Admin returns
3. Office corrects, resubmits
- Expected: status flows DRAFT → SUBMITTED → INITIAL_VERIFICATION → RETURNED_TO_OFFICE → SUBMITTED; two transitions recorded; original docs preserved

**E2E-003** — Director apology
1. After Final Verification, Director apologizes
- Expected: terminal APOLOGIZED; email sent to Office with apology body

**E2E-004** — Concurrent edit (optimistic locking)
- Two Typists try to send to embassy at same time
- Expected: one succeeds, one gets 409

---

## How to run

```bash
docker-compose exec auth-service npm test
docker-compose exec auth-service npm run test:cov

# E2E (after stack is up):
cd e2e && npm test
```

Target coverage: ≥ 85% lines for each service.
