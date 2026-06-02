# 06. Code Review Checklist

Every pull request must pass this checklist before merge. Reviewers paste this into the PR description and tick items.

## Functional correctness

- [ ] Code does what the PR description says it does
- [ ] Acceptance criteria from the ticket/BRD section are met
- [ ] Edge cases considered (empty, null, max, concurrent)
- [ ] Behavior matches the workflow state machine in `docs/03-workflow-state-machine.md`
- [ ] Bilingual handling (English + Arabic) preserved where applicable

## Architecture

- [ ] Change stays within its service's bounded context (no cross-schema FKs, no direct table reads from other services)
- [ ] Cross-service calls go through the documented HTTP APIs, not by directly importing types from other services
- [ ] No new infrastructure dependencies added without discussion
- [ ] Backward compatibility maintained or migration plan included

## Security (cross-reference `docs/05-security-review.md`)

- [ ] Every endpoint has `@UseGuards(JwtAuthGuard)` unless explicitly public
- [ ] Role-protected endpoints have `@RequirePersona(...)` decorator
- [ ] Object-level authorization checked (e.g., Office X cannot read Office Y data)
- [ ] All DTOs use `class-validator` decorators
- [ ] `forbidNonWhitelisted: true` is on the global ValidationPipe
- [ ] No secrets in code or commit history
- [ ] No string-concatenated SQL anywhere
- [ ] User input is never logged without redaction of PII
- [ ] New endpoints with state changes write to audit log
- [ ] No `console.log` left in code (use the logger)

## Data integrity

- [ ] Transactional boundaries correct (multi-table writes inside a TX)
- [ ] Optimistic locking used where concurrent edits possible
- [ ] Soft delete preferred over hard delete for auditable entities
- [ ] Migrations are reversible
- [ ] No data loss possible if migration fails midway

## Testing

- [ ] Unit tests added for new business logic
- [ ] Tests cover happy path AND at least one error path AND at least one validation case
- [ ] If state machine touched, new state-machine test added
- [ ] Coverage report shows ≥ 85% lines for changed files
- [ ] Tests are fast (no real network calls in unit tests)
- [ ] Test names describe the scenario (`should reject SUBMIT when documents missing`)

## API design

- [ ] REST conventions followed (verbs, status codes, pluralization)
- [ ] OpenAPI / Swagger decorators on every endpoint
- [ ] Error responses follow the documented shape: `{ statusCode, errorCode, message, details? }`
- [ ] Pagination uses standard `?page=&pageSize=` and returns `{ items, total, page, pageSize }`
- [ ] Date/time is ISO-8601 UTC; client converts for display
- [ ] Money fields include currency code

## Code quality

- [ ] No commented-out code
- [ ] No `any` types in TypeScript without explicit justification comment
- [ ] Functions ≤ ~40 lines (extract helpers)
- [ ] Cyclomatic complexity reasonable (eslint complexity warnings respected)
- [ ] Naming is precise: `request` not `req`, `actorPersona` not `role`
- [ ] No magic numbers / strings — use constants or enums
- [ ] Imports ordered: node built-ins → third-party → workspace → relative
- [ ] No unused imports or vars (eslint clean)

## Documentation

- [ ] README updated if dev workflow changed
- [ ] OpenAPI auto-docs reflect new endpoints
- [ ] `docs/` updated if architecture / schema / workflow changed
- [ ] Comments explain *why*, not *what*

## Performance

- [ ] No N+1 queries (eager relations or single JOIN)
- [ ] Indexes considered for new query patterns
- [ ] Payload sizes bounded
- [ ] No unbounded list endpoints (always paginated)
- [ ] Large file operations stream, not buffer

## Observability

- [ ] Structured logging at key decision points
- [ ] Error logs include enough context to debug
- [ ] Metrics emitted for new business events
- [ ] Health endpoint still works

## Approval rules

- 1 approving review required (2 for changes to auth, workflow, or security guards)
- All checks must pass in CI
- No "rubber-stamping" — write a comment confirming you read the diff

---

## Things that auto-block merge

- Unsigned commits (where enforced)
- `console.log` in production code
- Secrets in diff (gitleaks scan)
- Failing tests
- Coverage drop > 2%
- New high/critical npm audit findings
- `any` type without comment explaining why
