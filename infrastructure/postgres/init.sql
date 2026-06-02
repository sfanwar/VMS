-- ═══════════════════════════════════════════════════════════════
-- Visa Management System — Database Initialization
-- ═══════════════════════════════════════════════════════════════
-- One PostgreSQL database, one schema per microservice.
-- Each service owns its schema; cross-service references are by
-- ID only (no cross-schema FKs — that would break the bounded context).
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─────────────────────────────────────────────────────────────
-- Schemas (one per service)
-- ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS requests;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS reporting;

-- ═══════════════════════════════════════════════════════════════
-- AUTH schema
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auth.credentials (
    user_id        UUID PRIMARY KEY,
    email          CITEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    failed_logins  INT NOT NULL DEFAULT 0,
    locked_until   TIMESTAMPTZ,
    last_login_at  TIMESTAMPTZ,
    last_login_ip  INET,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credentials_email ON auth.credentials(email);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL,
    token_hash    TEXT NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    user_agent    TEXT,
    ip_address    INET,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON auth.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expiry ON auth.refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS auth.login_audit (
    id          BIGSERIAL PRIMARY KEY,
    email       CITEXT NOT NULL,
    user_id     UUID,
    success     BOOLEAN NOT NULL,
    reason      TEXT,
    ip_address  INET,
    user_agent  TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_audit_email ON auth.login_audit(email, occurred_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- USERS schema
-- ═══════════════════════════════════════════════════════════════

-- Offices (Request Source per BRD §1.1)
CREATE TABLE IF NOT EXISTS users.offices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_en             VARCHAR(200) NOT NULL UNIQUE,
    name_ar             VARCHAR(200) NOT NULL,
    authorized_person   VARCHAR(200) NOT NULL,
    telephone_number    VARCHAR(50) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authorized contact persons for an office (BRD §5.2). An office may have
-- several authorized persons; the request-create form lets the submitter pick
-- which one applies to a given request. The legacy offices.authorized_person /
-- telephone_number columns are retained as the office's primary contact for
-- backward compatibility and are mirrored here as the is_primary row.
CREATE TABLE IF NOT EXISTS users.office_contacts (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id         UUID NOT NULL REFERENCES users.offices(id) ON DELETE CASCADE,
    name              VARCHAR(200) NOT NULL,
    telephone_number  VARCHAR(50) NOT NULL,
    is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (office_id, name)
);

CREATE INDEX IF NOT EXISTS idx_office_contacts_office ON users.office_contacts(office_id);

CREATE TABLE IF NOT EXISTS users.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           CITEXT UNIQUE NOT NULL,
    full_name_en    VARCHAR(200) NOT NULL,
    full_name_ar    VARCHAR(200),
    office_id       UUID REFERENCES users.offices(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_office ON users.users(office_id);

-- Personas (roles, per BRD §6 — multiple personas per user)
CREATE TABLE IF NOT EXISTS users.personas (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code          VARCHAR(50) UNIQUE NOT NULL,    -- e.g. SENIOR_ADMIN, SENIOR_OFFICER
    name_en       VARCHAR(100) NOT NULL,
    name_ar       VARCHAR(100) NOT NULL,
    description   TEXT,
    is_system     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users.user_personas (
    user_id      UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
    persona_id   UUID NOT NULL REFERENCES users.personas(id) ON DELETE CASCADE,
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by  UUID,
    PRIMARY KEY (user_id, persona_id)
);

-- Seed personas (BRD §6)
INSERT INTO users.personas (code, name_en, name_ar, description, is_system) VALUES
  ('OFFICE',         'Office',                        'مكتب',                  'Authorized office user — submits requests',          TRUE),
  ('SENIOR_ADMIN',   'FAD Senior Administrator',      'كبير الإداريين',        'Creates requests; performs initial verification',    TRUE),
  ('SENIOR_OFFICER', 'FAD Senior Officer',            'كبير الموظفين',         'Performs final verification and final review',       TRUE),
  ('DIRECTOR',       'FAD Director',                  'مدير الإدارة',          'Approves, rejects, or returns requests',             TRUE),
  ('TYPIST',         'FAD Typist',                    'كاتب الإدارة',          'Processes embassy applications, updates fees',       TRUE),
  ('EMBASSY',        'Embassy',                       'السفارة',               'Embassy user processes visa applications',           TRUE),
  ('SYSADMIN',       'System Administrator',          'مسؤول النظام',          'Manages users, offices, and reference data',         TRUE)
ON CONFLICT (code) DO NOTHING;

-- Reference data: countries (BRD field "Country of Visit")
CREATE TABLE IF NOT EXISTS users.countries (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    iso_code  CHAR(2) UNIQUE NOT NULL,
    name_en   VARCHAR(100) NOT NULL,
    name_ar   VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Reference data: visa types (BRD field "Visa Type")
CREATE TABLE IF NOT EXISTS users.visa_types (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code      VARCHAR(30) UNIQUE NOT NULL,
    name_en   VARCHAR(100) NOT NULL,
    name_ar   VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO users.visa_types (code, name_en, name_ar) VALUES
  ('TOURIST',    'Tourist Visa',    'تأشيرة سياحية'),
  ('BUSINESS',   'Business Visa',   'تأشيرة عمل'),
  ('DIPLOMATIC', 'Diplomatic Visa', 'تأشيرة دبلوماسية'),
  ('OFFICIAL',   'Official Visa',   'تأشيرة رسمية'),
  ('TRANSIT',    'Transit Visa',    'تأشيرة عبور')
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- REQUESTS schema
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE requests.request_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'INITIAL_VERIFICATION',
    'FINAL_VERIFICATION',
    'DIRECTOR_REVIEW',
    'TYPIST_PROCESSING',
    'WAITING_FOR_EMBASSY',
    'AT_EMBASSY',
    'TYPIST_FEE_UPDATE',
    'WAITING_FINAL_REVIEW',
    'COMPLETED',
    'RETURNED_TO_OFFICE',
    'APOLOGIZED',
    'REJECTED'
);

CREATE TABLE IF NOT EXISTS requests.visa_requests (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number        VARCHAR(30) UNIQUE NOT NULL,
    office_id             UUID NOT NULL,
    office_contact_id     UUID,                 -- selected authorized person (users.office_contacts.id)
    created_by_user_id    UUID NOT NULL,
    country_of_visit_id   UUID NOT NULL,
    visa_type_id          UUID NOT NULL,
    number_of_passengers  INT NOT NULL CHECK (number_of_passengers > 0),
    request_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    status                requests.request_status NOT NULL DEFAULT 'DRAFT',
    current_assignee_id   UUID,
    fees_amount           NUMERIC(12,2),
    fees_currency         CHAR(3) DEFAULT 'AED',
    fees_updated_at       TIMESTAMPTZ,
    fees_updated_by       UUID,
    submitted_at          TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests.visa_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_office ON requests.visa_requests(office_id);
CREATE INDEX IF NOT EXISTS idx_requests_assignee ON requests.visa_requests(current_assignee_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests.visa_requests(created_by_user_id);

CREATE TABLE IF NOT EXISTS requests.beneficiaries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      UUID NOT NULL REFERENCES requests.visa_requests(id) ON DELETE CASCADE,
    full_name_en    VARCHAR(200) NOT NULL,
    full_name_ar    VARCHAR(200),
    passport_number VARCHAR(50),
    nationality     VARCHAR(100),
    sequence_no     INT NOT NULL,
    appointment_at  TIMESTAMPTZ,
    visa_number     VARCHAR(50),
    visa_issued_at  DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_request ON requests.beneficiaries(request_id);

-- Sequence for request numbers
CREATE SEQUENCE IF NOT EXISTS requests.request_number_seq START 1000;

-- ═══════════════════════════════════════════════════════════════
-- WORKFLOW schema
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflow.transitions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      UUID NOT NULL,
    from_status     VARCHAR(40),
    to_status       VARCHAR(40) NOT NULL,
    actor_user_id   UUID NOT NULL,
    actor_persona   VARCHAR(50) NOT NULL,
    action          VARCHAR(50) NOT NULL,    -- SUBMIT, VERIFY, APPROVE, RETURN, APOLOGIZE, etc.
    comment         TEXT,
    metadata        JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transitions_request ON workflow.transitions(request_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_transitions_actor ON workflow.transitions(actor_user_id);

-- Immutable audit log — append only, no UPDATE/DELETE allowed via policy
CREATE TABLE IF NOT EXISTS workflow.audit_events (
    id            BIGSERIAL PRIMARY KEY,
    event_type    VARCHAR(50) NOT NULL,
    entity_type   VARCHAR(50) NOT NULL,
    entity_id     UUID NOT NULL,
    actor_user_id UUID,
    actor_persona VARCHAR(50),
    payload       JSONB NOT NULL,
    ip_address    INET,
    user_agent    TEXT,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON workflow.audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON workflow.audit_events(actor_user_id, occurred_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- DOCUMENTS schema
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE documents.document_kind AS ENUM (
    'OFFICE_LETTER',
    'BENEFICIARY_ATTACHMENT',
    'EMBASSY_VISA_FORM',
    'SUPPORTING_DOCUMENT',
    'EMBASSY_LETTER',
    'VISA_APPLICATION',
    'VISA'
);

CREATE TABLE IF NOT EXISTS documents.documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      UUID NOT NULL,
    beneficiary_id  UUID,                     -- nullable for office-level docs
    kind            documents.document_kind NOT NULL,
    original_name   VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    size_bytes      BIGINT NOT NULL,
    sha256          CHAR(64) NOT NULL,        -- tamper detection
    storage_key     VARCHAR(500) NOT NULL,    -- key in MinIO bucket
    uploaded_by     UUID NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ               -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_documents_request ON documents.documents(request_id);
CREATE INDEX IF NOT EXISTS idx_documents_kind ON documents.documents(request_id, kind);
CREATE INDEX IF NOT EXISTS idx_documents_sha ON documents.documents(sha256);

-- ═══════════════════════════════════════════════════════════════
-- NOTIFICATIONS schema
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE notifications.delivery_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'BOUNCED');

CREATE TABLE IF NOT EXISTS notifications.emails (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      UUID,
    sent_by         UUID NOT NULL,
    to_addresses    TEXT[] NOT NULL,
    cc_addresses    TEXT[],
    bcc_addresses   TEXT[],
    subject         VARCHAR(500) NOT NULL,
    body_html       TEXT,
    body_text       TEXT,
    template_code   VARCHAR(50),
    status          notifications.delivery_status NOT NULL DEFAULT 'PENDING',
    error_message   TEXT,
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    attempts        INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_emails_request ON notifications.emails(request_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON notifications.emails(status, queued_at);

CREATE TABLE IF NOT EXISTS notifications.in_app (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL,
    request_id  UUID,
    title       VARCHAR(200) NOT NULL,
    body        TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inapp_user ON notifications.in_app(user_id, is_read, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Convenience: function to generate human-friendly request numbers
-- Format: VR-YYYY-NNNNNN  (e.g., VR-2026-001047)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION requests.next_request_number()
RETURNS VARCHAR AS $$
DECLARE
    seq_val BIGINT;
BEGIN
    seq_val := nextval('requests.request_number_seq');
    RETURN 'VR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(seq_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- Audit-log immutability (OWASP A09 / VAPT hardening)
-- These tables are append-only: rows may be INSERTed and SELECTed,
-- but never UPDATEd or DELETEd. Enforced with a trigger rather than
-- role GRANTs so it holds even against the table owner / superuser.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.deny_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are append-only: % on % is not permitted', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_login_audit_immutable ON auth.login_audit;
CREATE TRIGGER trg_login_audit_immutable
    BEFORE UPDATE OR DELETE ON auth.login_audit
    FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS trg_transitions_immutable ON workflow.transitions;
CREATE TRIGGER trg_transitions_immutable
    BEFORE UPDATE OR DELETE ON workflow.transitions
    FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON workflow.audit_events;
CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON workflow.audit_events
    FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();
