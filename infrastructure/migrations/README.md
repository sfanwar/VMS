# Database Migrations

Production-grade replacement for `infrastructure/postgres/init.sql`.

## Strategy

- **One repository, one ordered set of migrations.** Each migration is timestamped (`1714…-Name.ts`) and lives in `infrastructure/migrations/`.
- **Idempotent.** All `CREATE` statements use `IF NOT EXISTS` where Postgres allows; seed inserts use `ON CONFLICT DO NOTHING`.
- **Reversible.** Every migration has a `down()`.
- **Service-agnostic.** A single migration runner manages all schemas. Each service in production runs with a least-privilege DB user that only has grants on its own schema.

## Running

A small standalone CLI is recommended. Install once:

```bash
npm install -g typeorm@0.3.17 ts-node@10.9.2 typescript@5.3.3
```

Then:

```bash
# Apply all pending migrations
npx typeorm migration:run -d infrastructure/migrations/data-source.ts

# Show what's pending
npx typeorm migration:show -d infrastructure/migrations/data-source.ts

# Roll back the most recent
npx typeorm migration:revert -d infrastructure/migrations/data-source.ts
```

For dev / docker-compose, `init.sql` still seeds a fresh Postgres in one shot. For staging / production, drop `init.sql` and run migrations from CI instead.

## Adding a new migration

```bash
npx typeorm migration:create infrastructure/migrations/AddSomething
```

This creates `<timestamp>-AddSomething.ts` with empty `up()` / `down()`. Fill them in with raw SQL — keep migrations declarative and avoid TypeORM's auto-generation against the entity tree (it drifts from intent).

## File order

| File | Purpose |
|---|---|
| `1714000000001-Foundation.ts` | Extensions (uuid, pgcrypto, citext) + schemas |
| `1714000000002-CoreDomain.ts` | auth + users + requests tables |
| `1714000000003-WorkflowDocsNotifications.ts` | workflow + documents + notifications |
| `1714000000004-SystemReferenceData.ts` | Seed personas + visa types |

## Production hardening (apply after migrations)

```sql
-- Audit log: append-only
REVOKE UPDATE, DELETE ON workflow.audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON workflow.audit_events FROM <service_user>;

-- Per-schema least-privilege users
CREATE ROLE auth_svc       LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA auth TO auth_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO auth_svc;
-- repeat per schema
```
