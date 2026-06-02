# Visa Management System

A microservices-based Visa Management Module implementing the BRD workflow for the FAD: from request submission by an authorized Office through Senior Administrator initial verification, Senior Officer final verification, Director approval, Typist processing, and Final Review closure.

## Architecture at a glance

```
                        ┌──────────────┐
                        │  React UI    │
                        └──────┬───────┘
                               │ HTTPS
                        ┌──────▼───────┐
                        │ API Gateway  │  (JWT validation, routing, rate-limit)
                        └──────┬───────┘
                               │
        ┌──────────────┬───────┼───────────┬───────────────┐
        ▼              ▼       ▼           ▼               ▼
   ┌─────────┐   ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │  Auth   │   │  User   │ │ Request  │ │ Workflow │ │ Document │
   └────┬────┘   └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
        │             │            │            │             │
        │             │            ▼            ▼             ▼
        │             │     ┌──────────┐  ┌──────────┐  ┌────────┐
        │             │     │Notif.svc │  │Reporting │  │ MinIO  │
        │             │     └────┬─────┘  └────┬─────┘  └────────┘
        │             │          │             │
        ▼             ▼          ▼             ▼
                  ┌──────────────────────────────┐
                  │   PostgreSQL (one DB,        │
                  │   one schema per service)    │
                  └──────────────────────────────┘
                                │
                          ┌─────┴─────┐
                          │   Redis   │  (queues, cache, pub/sub for events)
                          └───────────┘
                                │
                          ┌─────┴─────┐
                          │  MailHog  │  (dev SMTP capture)
                          └───────────┘
```

## Services

| Service | Port | Responsibility |
|---|---|---|
| api-gateway | 3000 | Single entry point, JWT verify, route to backends |
| auth-service | 3001 | Login, JWT issue/refresh, password hashing |
| user-service | 3002 | Users, personas (roles), offices, authorized persons |
| request-service | 3003 | Visa request CRUD, beneficiaries, fees |
| workflow-service | 3004 | State machine, transitions, approvals, audit |
| document-service | 3005 | File upload/download via MinIO, metadata, SHA-256 |
| notification-service | 3006 | Email queue, templates, in-app notifications |
| reporting-service | 3007 | Dashboards, audit log queries |

## Quick start

**Prereqs:** Docker Desktop, Node 20+ (only if running services outside Docker for debugging).

```bash
# 1. Clone, then copy env
cp .env.example .env

# 2. Bring up infrastructure + all services
docker-compose up -d --build

# 3. Wait ~30s for everything to settle, then seed
docker-compose exec auth-service npm run seed

# 4. Visit
#    React UI:        http://localhost:5173
#    API Gateway:     http://localhost:3000
#    Swagger (auth):  http://localhost:3001/api/docs
#    MailHog UI:      http://localhost:8025
#    MinIO console:   http://localhost:9001  (minioadmin / minioadmin)
#    Postgres:        localhost:5432 (visa_admin / change-me)
```

**Seeded test accounts** (all password `Passw0rd!`):

| Username | Persona |
|---|---|
| office.user@office1.local | Office (requester) |
| senior.admin@fad.local | FAD Senior Administrator |
| senior.officer@fad.local | FAD Senior Officer |
| director@fad.local | FAD Director |
| typist@fad.local | FAD Typist |

## Project layout

```
visa-management-system/
├── docker-compose.yml          # Orchestrates everything
├── .env.example                # Copy to .env and edit
├── docs/                       # Architecture, schema, security, test cases
├── infrastructure/postgres/    # init.sql — creates schemas per service
├── services/                   # 8 NestJS microservices
│   ├── auth-service/           # ✅ Complete
│   ├── user-service/           # ✅ Complete
│   ├── request-service/        # ✅ Complete
│   ├── workflow-service/       # ✅ Complete (state machine)
│   ├── document-service/       # ✅ Complete (MinIO)
│   ├── notification-service/   # ✅ Complete (MailHog)
│   ├── api-gateway/            # ✅ Proxy + JWT + rate limiting
│   └── reporting-service/      # ✅ Dashboards, turnaround, bottlenecks, audit search
├── frontend/                   # ✅ React UI (login + request flow + document upload)
├── e2e/                        # ✅ Playwright E2E suite (E2E-001..004)
├── deploy/
│   ├── k8s/                    # Raw Kubernetes manifests
│   └── helm/vms/               # Templated Helm chart
├── .github/
│   ├── workflows/ci.yml        # PR pipeline: test matrix + E2E + security scan
│   └── workflows/release.yml   # Tag → build, push, scan all images
├── Makefile                    # `make help` for everything
└── postman-collection.json     # Importable Postman v2.1 collection
```

## Documentation

| Doc | Contents |
|---|---|
| `docs/01-architecture.md` | Service boundaries, data flow, event design |
| `docs/02-database-schema.md` | Every table, every column, every FK |
| `docs/03-workflow-state-machine.md` | States, transitions, who can do what |
| `docs/04-test-cases.md` | Positive, negative, validation, security cases |
| `docs/05-security-review.md` | OWASP-aligned checklist with mitigations |
| `docs/06-code-review-checklist.md` | What reviewers must verify |
| `docs/07-api-reference.md` | Endpoint table + Swagger URLs |

## Running tests

```bash
# Per service
docker-compose exec auth-service npm test
docker-compose exec user-service npm test
docker-compose exec request-service npm test
docker-compose exec workflow-service npm test

# Coverage
docker-compose exec auth-service npm run test:cov

# End-to-end (Playwright; requires `make up && make seed` first)
cd e2e && npm install && npm test
```

## Development workflow

```bash
make up              # Build + start the full stack
make seed            # Create the 5 test accounts
make seed-sample     # Add ~10 realistic requests across the workflow
make swagger         # Print every Swagger UI URL
make health          # Probe every service's /health
make psql            # Drop into the database
make help            # Full target list
```

Import `postman-collection.json` into Postman for a ready-to-use API workspace. The login requests auto-populate `{{accessToken}}` for the rest of the collection.

## Deployment

| Path | Use case |
|---|---|
| `docker-compose.yml` | Local development |
| `deploy/k8s/` | Raw YAML for one-shot apply to any cluster |
| `deploy/helm/vms/` | Templated, values-driven, environment-aware |
| `infrastructure/migrations/` | TypeORM migrations (replaces init.sql in prod) |

```bash
helm install vms deploy/helm/vms -n vms --create-namespace \
  -f deploy/helm/vms/values.yaml \
  --set global.imageTag=v1.0.0
```

CI/CD is wired via GitHub Actions: `.github/workflows/ci.yml` runs the test matrix and E2E on every PR; `.github/workflows/release.yml` builds, pushes, and Trivy-scans all images on `v*.*.*` tags.

## Development outside Docker (optional)

```bash
cd services/auth-service
npm install
npm run start:dev   # Hot reload on port 3001
```

## License & Compliance

This solution is built to comply with the organization's security policies and HHRC regulations. Confidential information classifications (per BRD cover page) are honored throughout the audit log and document handling layers. See `docs/05-security-review.md`.
