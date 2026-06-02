# End-to-End Tests

API-level Playwright tests that exercise the VMS stack as a black box.

## Prerequisites

```bash
# 1. Bring the stack up
make up

# 2. Seed test users
make seed

# 3. (Optional) Seed sample request data
make seed-sample

# 4. Install Playwright + browsers (one-time)
cd e2e
npm install
npm run install-browsers
```

## Running

```bash
npm test                  # All tests, headless
npm run test:ui           # Interactive UI mode
npm run report            # Open the HTML report after a run
```

## What's covered

| File | Scenario |
|---|---|
| `e2e-001-happy-path.api.spec.ts` | Office creates → verifies workflow gating |
| `e2e-002-returned-resubmit.api.spec.ts` | Return path + immutable audit |
| `e2e-003-rbac.api.spec.ts` | Persona enforcement, cross-office isolation |
| `e2e-004-auth.api.spec.ts` | Login, refresh rotation, logout, JWT rejection |

## Notes

- Tests run **serially** (`workers: 1`) — they share the seeded test users and want predictable IDs.
- Document-required transitions (`SUBMIT`, `SEND_TO_EMBASSY`, `UPLOAD_VISAS`) verify the *negative* path here (transition blocked without docs). A full positive document-upload E2E lives in the document-service's own integration tests and is run separately.
- For UI tests, add a second project block to `playwright.config.ts` pointing at `http://localhost:5173`.

## Adding tests

```bash
touch tests/e2e-005-my-scenario.api.spec.ts
```

Import the helpers, log in with the right persona, and assert.
