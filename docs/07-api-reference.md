# 07. API Reference

Quick lookup for every public endpoint. All endpoints go through the API gateway at `http://localhost:3000` in dev. Each service's full OpenAPI is at `http://localhost:300X/api/docs` (auth=3001, user=3002, request=3003, workflow=3004, document=3005, notification=3006, reporting=3007).

Auth: every endpoint except `/api/auth/login`, `/api/auth/refresh`, and `/health` requires `Authorization: Bearer <jwt>`.

Errors follow this shape:
```json
{
  "statusCode": 400,
  "errorCode": "BENEFICIARY_COUNT_MISMATCH",
  "message": "Number of beneficiaries must equal numberOfPassengers",
  "details": null,
  "timestamp": "2026-05-25T19:00:00.000Z",
  "path": "/api/requests"
}
```

## Auth (3001)

| Method | Path | Purpose | Body |
|---|---|---|---|
| POST | `/api/auth/login` | Issue JWT + refresh | `{email, password}` |
| POST | `/api/auth/refresh` | Rotate refresh, new access | `{refreshToken}` |
| POST | `/api/auth/logout` | Revoke refresh | `{refreshToken}` |
| POST | `/api/auth/change-password` | Change own password | `{currentPassword, newPassword}` |

## Users (3002)

| Method | Path | Persona | Purpose |
|---|---|---|---|
| GET | `/api/users/me` | any | Current user + personas |
| POST | `/api/users` | DIRECTOR | Provision a user |
| GET | `/api/personas` | any | List system personas |
| GET | `/api/offices` | any | List active offices |
| GET | `/api/offices/:id` | any | Get one office |
| POST | `/api/offices` | DIRECTOR, SENIOR_ADMIN | Create office |
| GET | `/api/reference/countries` | any | Country dropdown |
| GET | `/api/reference/visa-types` | any | Visa type dropdown |

## Requests (3003)

| Method | Path | Persona | Purpose |
|---|---|---|---|
| POST | `/api/requests` | OFFICE, SENIOR_ADMIN | Create draft |
| GET | `/api/requests` | any | List (Office sees own office only) |
| GET | `/api/requests/:id` | any | Get with beneficiaries |
| PATCH | `/api/requests/:id` | any | Update DRAFT or RETURNED_TO_OFFICE |
| PATCH | `/api/requests/:id/fees` | TYPIST, SENIOR_OFFICER | Update fees |

## Workflow (3004)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/workflow/transitions` | Execute a transition: `{requestId, action, comment?}` |
| GET | `/api/workflow/requests/:id/history` | Full transition timeline |
| GET | `/api/workflow/state-machine` | All states + rules (UI uses this) |
| GET | `/api/workflow/next-actions?status=…` | Actions available to current user |

Actions: `SUBMIT`, `START_INITIAL_VERIFY`, `VERIFY_OK`, `RETURN_TO_OFFICE`, `APPROVE`, `RETURN_FOR_CORRECTION`, `APOLOGIZE`, `REJECT`, `SEND_TO_EMBASSY`, `UPLOAD_VISAS`, `REASSIGN_TO_SELF`, `COMPLETE`, `RESUBMIT`.

## Documents (3005)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/documents/upload` | Multipart: `file`, `requestId`, `kind`, `beneficiaryId?` |
| GET | `/api/documents?requestId=…` | List docs for a request |
| GET | `/api/documents/:id/download` | Stream the bytes |
| DELETE | `/api/documents/:id` | Soft delete |

Document kinds: `OFFICE_LETTER`, `BENEFICIARY_ATTACHMENT`, `EMBASSY_VISA_FORM`, `SUPPORTING_DOCUMENT`, `EMBASSY_LETTER`, `VISA_APPLICATION`, `VISA`. Max file size 25 MB. MIME allowlist per kind.

## Notifications (3006)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/notifications/email` | Send ad-hoc email (the BRD "Actions" button) |
| GET | `/api/notifications/emails?requestId=…` | List emails sent for a request (audit) |
| GET | `/api/notifications/in-app/mine` | In-app feed |
| PATCH | `/api/notifications/in-app/:id/read` | Mark notification read |

## Reporting (3007)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/reporting/dashboard` | Status counts + recent transitions + today's activity |

## Internal endpoints (blocked at the gateway)

Reachable only from within the docker network, protected by `x-internal-key`:

- `GET  /api/internal/users/:id/profile` — auth-service uses this
- `GET  /api/internal/requests/:id/snapshot` — workflow-service uses this
- `PATCH /api/internal/requests/:id/status` — workflow-service uses this
- `GET  /api/internal/documents/counts?requestId=…` — workflow-service uses this
- `POST /api/internal/notifications/workflow-event` — workflow-service uses this
