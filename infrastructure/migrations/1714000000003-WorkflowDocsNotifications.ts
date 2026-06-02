import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 003 — Workflow, documents, and notifications tables.
 */
export class WorkflowDocsNotifications0003 implements MigrationInterface {
  name = 'WorkflowDocsNotifications0003';

  async up(qr: QueryRunner): Promise<void> {
    // ─── workflow ────────────────────────────────────────
    await qr.query(`
      CREATE TABLE workflow.transitions (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        request_id      UUID NOT NULL,
        from_status     VARCHAR(40),
        to_status       VARCHAR(40) NOT NULL,
        actor_user_id   UUID NOT NULL,
        actor_persona   VARCHAR(50) NOT NULL,
        action          VARCHAR(50) NOT NULL,
        comment         TEXT,
        metadata        JSONB,
        occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_transitions_request ON workflow.transitions(request_id, occurred_at)`);
    await qr.query(`CREATE INDEX idx_transitions_actor   ON workflow.transitions(actor_user_id)`);

    await qr.query(`
      CREATE TABLE workflow.audit_events (
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
      )
    `);
    await qr.query(`CREATE INDEX idx_audit_entity ON workflow.audit_events(entity_type, entity_id, occurred_at DESC)`);
    await qr.query(`CREATE INDEX idx_audit_actor  ON workflow.audit_events(actor_user_id, occurred_at DESC)`);

    // ─── documents ───────────────────────────────────────
    await qr.query(`
      CREATE TYPE documents.document_kind AS ENUM (
        'OFFICE_LETTER','BENEFICIARY_ATTACHMENT','EMBASSY_VISA_FORM',
        'SUPPORTING_DOCUMENT','EMBASSY_LETTER','VISA_APPLICATION','VISA'
      )
    `);

    await qr.query(`
      CREATE TABLE documents.documents (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        request_id      UUID NOT NULL,
        beneficiary_id  UUID,
        kind            documents.document_kind NOT NULL,
        original_name   VARCHAR(500) NOT NULL,
        mime_type       VARCHAR(100) NOT NULL,
        size_bytes      BIGINT NOT NULL,
        sha256          CHAR(64) NOT NULL,
        storage_key     VARCHAR(500) NOT NULL,
        uploaded_by     UUID NOT NULL,
        uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_documents_request ON documents.documents(request_id)`);
    await qr.query(`CREATE INDEX idx_documents_kind    ON documents.documents(request_id, kind)`);
    await qr.query(`CREATE INDEX idx_documents_sha     ON documents.documents(sha256)`);

    // ─── notifications ───────────────────────────────────
    await qr.query(`
      CREATE TYPE notifications.delivery_status AS ENUM ('PENDING','SENT','FAILED','BOUNCED')
    `);

    await qr.query(`
      CREATE TABLE notifications.emails (
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
      )
    `);
    await qr.query(`CREATE INDEX idx_emails_request ON notifications.emails(request_id)`);
    await qr.query(`CREATE INDEX idx_emails_status  ON notifications.emails(status, queued_at)`);

    await qr.query(`
      CREATE TABLE notifications.in_app (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL,
        request_id  UUID,
        title       VARCHAR(200) NOT NULL,
        body        TEXT NOT NULL,
        is_read     BOOLEAN NOT NULL DEFAULT FALSE,
        read_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_inapp_user ON notifications.in_app(user_id, is_read, created_at DESC)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS notifications.in_app`);
    await qr.query(`DROP TABLE IF EXISTS notifications.emails`);
    await qr.query(`DROP TYPE  IF EXISTS notifications.delivery_status`);
    await qr.query(`DROP TABLE IF EXISTS documents.documents`);
    await qr.query(`DROP TYPE  IF EXISTS documents.document_kind`);
    await qr.query(`DROP TABLE IF EXISTS workflow.audit_events`);
    await qr.query(`DROP TABLE IF EXISTS workflow.transitions`);
  }
}
