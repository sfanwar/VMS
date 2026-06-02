\# VMS — Engineering Handoff for Claude Code



\## Goal



Build and maintain the \*\*Visa Management System (VMS)\*\* for the Foreign Affairs Department (FAD): replace the manual, email/paper-based visa process with an automated, role-based digital workflow per the BRD (`Visa\\\_Management\\\_Module\\\_BRD\\\_-\\\_Team.docx`). Stack: \*\*NestJS microservices + React/Vite frontend\*\*, Postgres, Docker Compose.



\## Project Context



\- \*\*Location (sandbox):\*\* `/home/claude/visa-management-system/` · \*\*Deliverable tarball:\*\* `/mnt/user-data/outputs/visa-management-system.tar.gz`

\- \*\*User deploys on Windows/PowerShell:\*\* `D:\\\\Working\\\\Visa Management Module\\\\Project Files\\\\visa-management-system`

\- \*\*Services (8):\*\* `api-gateway`, `auth-service`, `user-service`, `request-service`, `workflow-service`, `document-service`, `notification-service`, `reporting-service` + React frontend.

\- \*\*Patterns:\*\* schema-per-service Postgres; pure-function state machine in `workflow-service`; gateway verifies JWT and propagates personas; `@RequirePersona` + `PersonaGuard`; internal `X-Internal-Key`; \*\*cross-tenant access returns 404, not 403\*\*; bilingual EN/AR with RTL.

\- \*\*Aesthetic:\*\* diplomatic teal `#0D3B3A` + gold `#C9A857` + white.

\- \*\*Personas (6):\*\* `OFFICE`, `SENIOR\\\_ADMIN`, `SENIOR\\\_OFFICER`, `DIRECTOR`, `TYPIST`, `EMBASSY`.

\- \*\*Postgres:\*\* user `visa\\\_admin` / pass `change-me` / db `visa\\\_management` (single role; likely DB owner).

\- \*\*Seeded accounts\*\* (password `Passw0rd!`): `office.user@office1.local`, `senior.admin@fad.local`, `senior.officer@fad.local`, `director@fad.local`, `typist@fad.local`, `embassy.user@embassy.local`.



\## Source-of-Truth Files



\- \*\*State machine:\*\* `services/workflow-service/src/state-machine/state-machine.ts` — exports `RequestStatus`, `WorkflowAction`, `TRANSITION\\\_TABLE`. The gateway/controller action allowlist and the UI's available actions are \*\*derived\*\* from `TRANSITION\\\_TABLE` (never hand-maintain a parallel list).

\- \*\*DB schema/enum:\*\* `infrastructure/postgres/init.sql` — `requests.request\\\_status` is a \*\*PG enum\*\*.

\- \*\*Status DTO allowlist:\*\* `services/request-service/src/dto/request.dto.ts` (`ALL\\\_STATUSES` must mirror the enum).

\- \*\*i18n:\*\* `frontend/src/lib/i18n.tsx` + `locales/en.ts` / `locales/ar.ts` (`ar` typed as `typeof en`; keep structurally identical).

\- \*\*Seed:\*\* `services/auth-service/src/seed.ts`.



\## Current Workflow (validated against the BRD "Future (To-be)" Visio)



| From | Action | Persona(s) | To | Notes |

|---|---|---|---|---|

| DRAFT | SUBMIT | OFFICE, SENIOR\_ADMIN | SUBMITTED | requires OFFICE\_LETTER, BENEFICIARY\_ATTACHMENT, EMBASSY\_VISA\_FORM |

| SUBMITTED | START\_INITIAL\_VERIFY | SENIOR\_ADMIN | INITIAL\_VERIFICATION | |

| INITIAL\_VERIFICATION | VERIFY\_OK | SENIOR\_ADMIN | FINAL\_VERIFICATION | |

| INITIAL\_VERIFICATION | RETURN\_TO\_OFFICE | SENIOR\_ADMIN | RETURNED\_TO\_OFFICE | |

| FINAL\_VERIFICATION | VERIFY\_OK | SENIOR\_OFFICER | DIRECTOR\_REVIEW | requires EMBASSY\_LETTER |

| FINAL\_VERIFICATION | RETURN\_TO\_OFFICE | SENIOR\_OFFICER | RETURNED\_TO\_OFFICE | |

| DIRECTOR\_REVIEW | APPROVE | DIRECTOR | TYPIST\_PROCESSING | |

| DIRECTOR\_REVIEW | RETURN\_FOR\_CORRECTION | DIRECTOR | FINAL\_VERIFICATION | comment required |

| DIRECTOR\_REVIEW | APOLOGIZE | DIRECTOR | APOLOGIZED | comment required |

| TYPIST\_PROCESSING | SEND\_TO\_EMBASSY | TYPIST | WAITING\_FOR\_EMBASSY | requires VISA\_APPLICATION |

| WAITING\_FOR\_EMBASSY | EMBASSY\_PROCESS | EMBASSY | AT\_EMBASSY | |

| WAITING\_FOR\_EMBASSY | REASSIGN\_TO\_SELF | TYPIST | WAITING\_FOR\_EMBASSY | |

| AT\_EMBASSY | UPLOAD\_VISAS | OFFICE, TYPIST | \*\*TYPIST\_FEE\_UPDATE\*\* | requires VISA |

| AT\_EMBASSY | REASSIGN\_TO\_SELF | TYPIST | AT\_EMBASSY | |

| \*\*TYPIST\_FEE\_UPDATE\*\* | SUBMIT\_FEES | TYPIST | WAITING\_FINAL\_REVIEW | typist updates fees, then forwards |

| \*\*TYPIST\_FEE\_UPDATE\*\* | RETURN\_FOR\_CORRECTION | TYPIST | AT\_EMBASSY | comment required |

| WAITING\_FINAL\_REVIEW | COMPLETE | SENIOR\_OFFICER | COMPLETED | |

| WAITING\_FINAL\_REVIEW | RETURN\_FOR\_CORRECTION | SENIOR\_OFFICER | TYPIST\_FEE\_UPDATE | comment required |

| RETURNED\_TO\_OFFICE | RESUBMIT | OFFICE, SENIOR\_ADMIN | SUBMITTED | |



\- \*\*No Director REJECT\*\* (removed; confirmed absent in the Visio). `REJECT` action type / `REJECTED` status remain in the enum but are unreachable.

\- \*\*Fee update\*\* is a separate, non-status-gated endpoint: `PATCH /api/requests/:id/fees` (TYPIST, SENIOR\_OFFICER).



\## Key Decisions Made This Session



1\. \*\*EMBASSY visibility\*\* scoped to `EMBASSY\\\_VISIBLE\\\_STATUSES = \\\['WAITING\\\_FOR\\\_EMBASSY','AT\\\_EMBASSY']` in `canActorSeeRequest` + list query (fixes "Request not found").

2\. \*\*Dashboard data:\*\* `pageSize` cap raised 100→1000; `AT\\\_EMBASSY` added to `ALL\\\_STATUSES`; dashboard load errors now surfaced (no silent empty state).

3\. \*\*Dashboard layout:\*\* scoped CSS override `.charts-grid .card + .card { margin-top: 0 }` (keeps global `.card + .card` 20px for stacked cards elsewhere).

4\. \*\*Action allowlist\*\* derived from `TRANSITION\\\_TABLE` (fixed `EMBASSY\\\_PROCESS` rejection; prevents future drift).

5\. \*\*Offices:\*\* 20 sample offices in seed; office is an \*\*enabled dropdown for everyone\*\*; `authorizedPerson` + `telephoneNumber` auto-populate read-only (BRD §5.2).

6\. \*\*Office-user model = "submitter":\*\* can select any office; `resolveOfficeId` honors selection, falls back to own; visibility broadened to \*\*own office OR created-by-me\*\* (additive, cross-tenant protection intact).

7\. \*\*Duplicate offices fixed:\*\* `UNIQUE` on `offices.name\\\_en`; idempotent `INSERT … SELECT … WHERE NOT EXISTS`; one-time dedup step in seed.

8\. \*\*New-request documents\*\* limited to the 4 office docs via stage-aware `DocumentUploader` (`UPLOADABLE\\\_BY\\\_STATUS`).

9\. \*\*Typist fee-update stage\*\* inserted (`TYPIST\\\_FEE\\\_UPDATE` + `SUBMIT\\\_FEES`); fee-edit UI added to detail page for TYPIST/SENIOR\_OFFICER.

10\. \*\*Two Visio return loops\*\* added (rows marked \*\*NEW\*\* above).

11\. \*\*Security patches (code-level):\*\* JWT algorithm pinning (`algorithms: \\\['HS256']` at gateway); audit-log immutability via \*\*triggers\*\* (`deny\\\_mutation()` on `auth.login\\\_audit`, `workflow.transitions`, `workflow.audit\\\_events`); frontend idle-session timeout (`useIdleTimeout`, 30 min, cross-tab). Already present: ValidationPipe `whitelist + forbidNonWhitelisted`, helmet, rate limiting, CORS allowlist, parameterized queries.

12\. \*\*Seed type bug fixed:\*\* `inconsistent types deduced for parameter $2` → added `::uuid` / `::varchar` casts in the office INSERT.

13\. \*\*Deliverable:\*\* `VMS-Security-Architecture.pptx` (11-slide deck) created alongside existing docs.



\## Constraints / Gotchas



\- \*\*Seed path in Docker is `dist/seed.js`\*\* (NestJS `nest build` strips `src/`), \*\*not\*\* `dist/src/seed.js`. Local `tsc` produces `dist/src/seed.js` — different; don't confuse them.

\- \*\*DB role `visa\\\_admin` is the owner\*\* → `REVOKE` won't hold → use \*\*triggers\*\* for any immutability/constraint that must survive owner access.

\- \*\*`init.sql` only runs on a fresh DB\*\* (`CREATE TABLE IF NOT EXISTS`, `CREATE TYPE`). Enum/constraint/trigger changes require `docker compose down -v` then re-seed.

\- \*\*PG enum changes\*\* (new statuses) require a fresh DB (`down -v`).

\- \*\*Frontend changes need `--build` + hard refresh\*\* (Ctrl+Shift+R). Cached bundle is the #1 "change not showing" cause.

\- \*\*Docker build caching can serve stale compiled code.\*\* When a fix "isn't taking," rebuild with `docker compose build --no-cache <service>` and \*\*verify inside the container\*\* before trusting it (e.g. `docker compose exec auth-service grep -A2 "INSERT INTO users.offices" dist/seed.js`).

\- Keep `en.ts`/`ar.ts` structurally identical; `en.ts` is \*\*not\*\* `as const` (would break `ar: typeof en`).

\- Tests: `workflow-service` (63) and `request-service` (17) must stay green after state-machine or scoping changes.



\## Deploy Playbook



\- \*\*Frontend only:\*\* `docker compose up -d --build frontend` + hard refresh.

\- \*\*One backend service:\*\* `docker compose up -d --build <service>`.

\- \*\*init.sql / enum / seed changes (full clean):\*\*

&#x20; ```

&#x20; docker compose down -v

&#x20; docker compose up -d --build

&#x20; Start-Sleep -Seconds 60

&#x20; docker compose exec auth-service node dist/seed.js

&#x20; ```

\- \*\*Verifications:\*\* `GET /api/offices` (Bearer) → 20, no dups · `DELETE FROM workflow.audit\\\_events` → must fail "append-only" · seed ends with `Seed complete. All accounts use password: Passw0rd!`.



\## Open Questions / Pending



\- \*\*Immediate:\*\* the last seed failure was a \*\*stale-container\*\* issue (old `dist/seed.js` without casts). Resolution = clean rebuild (`--no-cache auth-service`) + verify the compiled query has casts before seeding. Confirm this clears it.

\- \*\*Office-user model:\*\* currently "submitter" (can pick any office). Decide whether to keep, or revert to \*\*locked-to-own-office\*\* (stricter tenant isolation) — flip is small.

\- \*\*Fee editing\*\* is allowed for SENIOR\_OFFICER as well as TYPIST. Confirm whether to restrict to typist-only at the `TYPIST\\\_FEE\\\_UPDATE` stage.

\- \*\*Multiple authorized persons per office\*\* (a `users.office\\\_contacts` table + sub-dropdown) — proposed, not built. Currently one contact per office.

\- \*\*Security items requiring infrastructure (not yet implemented):\*\* MFA (TOTP), ClamAV upload scanning, mTLS/service mesh, SIEM + alerting, external pen test, password-complexity policy (no user-facing password input exists yet — `CreateUserDto` has no password field). These remain in the Security Architecture gap register (HIGH/MEDIUM/LOW).

