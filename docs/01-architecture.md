# 01. Architecture

## Design principles

1. **One bounded context per service.** Each microservice owns its domain — auth owns credentials, requests owns visa requests, etc. No service reads another service's tables directly.
2. **Database-per-service via schemas.** One physical Postgres instance, one schema per service. Cross-service references are by ID only; integrity is maintained at the application layer.
3. **Stateless services.** Each service can be horizontally scaled. All state in Postgres / Redis / MinIO.
4. **JWT-based auth.** Stateless verification. Tokens issued by auth-service; verified by every service via shared JWT secret.
5. **Async where possible.** Notifications and audit events flow through Redis queues so the request path stays fast.
6. **Audit everything that mutates.** Every state change emits an immutable audit event.

## Service responsibilities

### api-gateway (port 3000)
Single public ingress. Validates JWT on every request, applies rate limiting, forwards to the right backend service. CORS allowed only from the configured frontend origin.

### auth-service (port 3001)
- POST `/auth/login` — verify password, issue JWT (access + refresh)
- POST `/auth/refresh` — exchange refresh token for new access token
- POST `/auth/logout` — revoke refresh token
- POST `/auth/change-password` — for authenticated users
- Owns: `auth.credentials`, `auth.refresh_tokens`, `auth.login_audit`
- Talks to: user-service (to resolve user → personas at login)

### user-service (port 3002)
- CRUD for users, personas, offices, countries, visa types
- GET `/users/me` — full profile + personas (called during login)
- POST `/users` (admin only) — create user (issues internal credential creation event to auth-service)
- Owns: `users.*`

### request-service (port 3003)
- POST `/requests` — create draft visa request (BRD §5.2 step 1)
- PATCH `/requests/:id` — update before submission
- GET `/requests` — paginated, filtered by office / status / assignee (RBAC enforced)
- GET `/requests/:id` — full details + beneficiaries + transition history
- POST `/requests/:id/beneficiaries` — add beneficiary
- PATCH `/requests/:id/fees` — update fees (Typist or Senior Officer)
- Owns: `requests.visa_requests`, `requests.beneficiaries`
- Talks to: workflow-service (for transitions), document-service (to validate attachment counts)

### workflow-service (port 3004) — The Brain
- POST `/workflow/transitions` — execute a state transition (called by request-service)
- GET `/workflow/state-machine` — returns the full state graph (used by frontend to show available actions)
- GET `/workflow/requests/:id/history` — full transition timeline
- GET `/workflow/requests/:id/next-actions` — what the current user can do
- Owns: `workflow.transitions`, `workflow.audit_events`
- Emits: events to Redis pub/sub on every transition
- Talks to: notification-service (to send emails on key transitions)

### document-service (port 3005)
- POST `/documents/upload` — accept multipart upload, compute SHA-256, store in MinIO, save metadata
- GET `/documents/:id/download` — stream from MinIO with auth check
- GET `/documents?requestId=` — list documents for a request
- DELETE `/documents/:id` — soft delete
- POST `/documents/validate-counts` — used by workflow-service to verify the BRD rule "Number of attachments must be equal to number of beneficiaries"
- Owns: `documents.documents`
- Talks to: MinIO (S3 API)

### notification-service (port 3006)
- POST `/notifications/email` — enqueue email (called by workflow-service and the "Actions" button)
- GET `/notifications/emails?requestId=` — list emails sent for a request (auditability)
- GET `/notifications/in-app/mine` — in-app notification feed for current user
- PATCH `/notifications/in-app/:id/read` — mark notification read
- Owns: `notifications.emails`, `notifications.in_app`
- Talks to: SMTP (MailHog in dev), Redis (queue worker)

### reporting-service (port 3007)
- GET `/reporting/dashboard` — request counts by status, avg processing time, etc.
- GET `/reporting/office/:id` — office-level metrics
- GET `/reporting/audit?...` — audit log search (admin/director only)
- Phase 2 per BRD §7. Currently scaffolded; extend in next iteration.

## Request lifecycle (BRD §5.2, To-Be workflow)

```
[Office user]                 DRAFT
   │ creates + uploads docs
   ▼
[Office user]                 SUBMITTED ──────► INITIAL_VERIFICATION
                                                  │
[Senior Admin]                  ──────────────────┤
   │ verifies                                     │
   ├─► incomplete? ──► RETURNED_TO_OFFICE ────────┘
   │
   ▼ complete
[Senior Officer]              FINAL_VERIFICATION
   │ verifies
   ├─► incomplete? ──► RETURNED_TO_OFFICE
   │
   ▼ complete + Embassy Letter attached
[Director]                    DIRECTOR_REVIEW
   │
   ├─► return ──► FINAL_VERIFICATION (back to Senior Officer)
   ├─► apologize ──► APOLOGIZED  (terminal)
   │
   ▼ approve
[Typist]                      TYPIST_PROCESSING
   │ uploads visa apps, schedules appointments, updates fees
   ▼
                              WAITING_FOR_EMBASSY
   │ Office (or Typist on behalf) uploads visas
   ▼
[Senior Officer]              WAITING_FINAL_REVIEW
   │ final close + optional fee update
   ▼
                              COMPLETED  (terminal)
```

See `03-workflow-state-machine.md` for the full transition table including who can do what at each state.

## Data flow — example: Director approves a request

```
Frontend                API Gateway          Workflow Service        Request Service        Notification Service        MailHog
   │                         │                       │                       │                         │                       │
   │ POST /workflow/         │                       │                       │                         │                       │
   │   transitions ─────────►│                       │                       │                         │                       │
   │   {action:APPROVE}      │ verify JWT, forward   │                       │                         │                       │
   │                         ├──────────────────────►│                       │                         │                       │
   │                         │                       │ check permission via persona                    │                       │
   │                         │                       │ check transition is legal                       │                       │
   │                         │                       │ BEGIN TX                                        │                       │
   │                         │                       │ INSERT transition                               │                       │
   │                         │                       │ UPDATE request status ──────────────────────────│                       │
   │                         │                       │                       │ via internal API        │                       │
   │                         │                       │ INSERT audit_event                              │                       │
   │                         │                       │ COMMIT                                          │                       │
   │                         │                       │                                                 │                       │
   │                         │                       │ enqueue email job ─────────────────────────────►│                       │
   │                         │                       │                                                 │ render template       │
   │                         │                       │                                                 │ SMTP send ───────────►│
   │                         │                       │                                                 │ INSERT email row      │
   │                         │ ◄─────────────────────│ 200 OK + new state                              │                       │
   │ ◄───────────────────────│                                                                                                 │
```

## Why these technology choices

| Choice | Rationale |
|---|---|
| **NestJS** | First-class microservices support, decorator-driven DI, OpenAPI generation, Jest integration |
| **TypeScript** | Static types catch RBAC + workflow bugs that runtime tests miss |
| **PostgreSQL** | ACID for financial fees, JSONB for flexible audit payloads, citext for case-insensitive emails |
| **TypeORM** | Migrations, query builder, repository pattern fits NestJS DI |
| **Redis** | BullMQ-compatible queues for notifications; pub/sub for cross-service events |
| **MinIO** | S3-compatible object storage; runs locally; production can swap to AWS S3 with zero code change |
| **JWT + Passport** | Stateless, microservice-friendly; refresh tokens stored hashed in DB so they're revocable |
| **MailHog** | Captures all dev email in a web UI — zero-config SMTP testing |

## Scaling path

- Each service scales independently (horizontal pods + load balancer)
- Postgres → managed RDS / Aurora with read replicas for reporting
- Redis → managed ElastiCache, cluster mode for high throughput
- MinIO → swap endpoint to S3, no code change
- API gateway → fronted by CloudFront/ALB, WAF in front for production
