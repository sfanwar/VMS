import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 002 — Core domain tables for auth, users, and requests.
 */
export class CoreDomain0002 implements MigrationInterface {
  name = 'CoreDomain0002';

  async up(qr: QueryRunner): Promise<void> {
    // ─── auth ────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE auth.credentials (
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
      )
    `);
    await qr.query(`CREATE INDEX idx_credentials_email ON auth.credentials(email)`);

    await qr.query(`
      CREATE TABLE auth.refresh_tokens (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       UUID NOT NULL,
        token_hash    TEXT NOT NULL UNIQUE,
        expires_at    TIMESTAMPTZ NOT NULL,
        revoked_at    TIMESTAMPTZ,
        user_agent    TEXT,
        ip_address    INET,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_refresh_user ON auth.refresh_tokens(user_id)`);
    await qr.query(`CREATE INDEX idx_refresh_expiry ON auth.refresh_tokens(expires_at)`);

    await qr.query(`
      CREATE TABLE auth.login_audit (
        id          BIGSERIAL PRIMARY KEY,
        email       CITEXT NOT NULL,
        user_id     UUID,
        success     BOOLEAN NOT NULL,
        reason      TEXT,
        ip_address  INET,
        user_agent  TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_login_audit_email ON auth.login_audit(email, occurred_at DESC)`);

    // ─── users ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE users.offices (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name_en             VARCHAR(200) NOT NULL,
        name_ar             VARCHAR(200) NOT NULL,
        authorized_person   VARCHAR(200) NOT NULL,
        telephone_number    VARCHAR(50) NOT NULL,
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE TABLE users.users (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email           CITEXT UNIQUE NOT NULL,
        full_name_en    VARCHAR(200) NOT NULL,
        full_name_ar    VARCHAR(200),
        office_id       UUID REFERENCES users.offices(id) ON DELETE SET NULL,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_users_office ON users.users(office_id)`);

    await qr.query(`
      CREATE TABLE users.personas (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code          VARCHAR(50) UNIQUE NOT NULL,
        name_en       VARCHAR(100) NOT NULL,
        name_ar       VARCHAR(100) NOT NULL,
        description   TEXT,
        is_system     BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    await qr.query(`
      CREATE TABLE users.user_personas (
        user_id      UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
        persona_id   UUID NOT NULL REFERENCES users.personas(id) ON DELETE CASCADE,
        assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assigned_by  UUID,
        PRIMARY KEY (user_id, persona_id)
      )
    `);

    await qr.query(`
      CREATE TABLE users.countries (
        id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        iso_code  CHAR(2) UNIQUE NOT NULL,
        name_en   VARCHAR(100) NOT NULL,
        name_ar   VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    await qr.query(`
      CREATE TABLE users.visa_types (
        id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code      VARCHAR(30) UNIQUE NOT NULL,
        name_en   VARCHAR(100) NOT NULL,
        name_ar   VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    // ─── requests ────────────────────────────────────────
    await qr.query(`
      CREATE TYPE requests.request_status AS ENUM (
        'DRAFT','SUBMITTED','INITIAL_VERIFICATION','FINAL_VERIFICATION',
        'DIRECTOR_REVIEW','TYPIST_PROCESSING','WAITING_FOR_EMBASSY','AT_EMBASSY',
        'WAITING_FINAL_REVIEW','COMPLETED','RETURNED_TO_OFFICE','APOLOGIZED','REJECTED'
      )
    `);

    await qr.query(`
      CREATE TABLE requests.visa_requests (
        id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        request_number        VARCHAR(30) UNIQUE NOT NULL,
        office_id             UUID NOT NULL,
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
      )
    `);
    await qr.query(`CREATE INDEX idx_requests_status      ON requests.visa_requests(status)`);
    await qr.query(`CREATE INDEX idx_requests_office      ON requests.visa_requests(office_id)`);
    await qr.query(`CREATE INDEX idx_requests_assignee    ON requests.visa_requests(current_assignee_id)`);
    await qr.query(`CREATE INDEX idx_requests_created_by  ON requests.visa_requests(created_by_user_id)`);

    await qr.query(`
      CREATE TABLE requests.beneficiaries (
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
      )
    `);
    await qr.query(`CREATE INDEX idx_beneficiaries_request ON requests.beneficiaries(request_id)`);

    await qr.query(`CREATE SEQUENCE requests.request_number_seq START 1000`);

    await qr.query(`
      CREATE OR REPLACE FUNCTION requests.next_request_number()
      RETURNS VARCHAR AS $$
      DECLARE
        seq_val BIGINT;
      BEGIN
        seq_val := nextval('requests.request_number_seq');
        RETURN 'VR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(seq_val::TEXT, 6, '0');
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP FUNCTION IF EXISTS requests.next_request_number()`);
    await qr.query(`DROP SEQUENCE IF EXISTS requests.request_number_seq`);
    await qr.query(`DROP TABLE IF EXISTS requests.beneficiaries`);
    await qr.query(`DROP TABLE IF EXISTS requests.visa_requests`);
    await qr.query(`DROP TYPE IF EXISTS requests.request_status`);
    await qr.query(`DROP TABLE IF EXISTS users.visa_types`);
    await qr.query(`DROP TABLE IF EXISTS users.countries`);
    await qr.query(`DROP TABLE IF EXISTS users.user_personas`);
    await qr.query(`DROP TABLE IF EXISTS users.personas`);
    await qr.query(`DROP TABLE IF EXISTS users.users`);
    await qr.query(`DROP TABLE IF EXISTS users.offices`);
    await qr.query(`DROP TABLE IF EXISTS auth.login_audit`);
    await qr.query(`DROP TABLE IF EXISTS auth.refresh_tokens`);
    await qr.query(`DROP TABLE IF EXISTS auth.credentials`);
  }
}
