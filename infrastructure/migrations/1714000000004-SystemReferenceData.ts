import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 004 — System reference data: personas and visa types.
 *
 * Idempotent: ON CONFLICT DO NOTHING. Safe to re-run.
 * Application-level seed data (test offices, test users) lives in
 * `services/auth-service/src/seed.ts` and is not part of migrations.
 */
export class SystemReferenceData0004 implements MigrationInterface {
  name = 'SystemReferenceData0004';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      INSERT INTO users.personas (code, name_en, name_ar, description, is_system) VALUES
        ('OFFICE',         'Office',                   'مكتب',           'Authorized office user — submits requests',       TRUE),
        ('SENIOR_ADMIN',   'FAD Senior Administrator', 'كبير الإداريين', 'Creates requests; performs initial verification', TRUE),
        ('SENIOR_OFFICER', 'FAD Senior Officer',       'كبير الموظفين',  'Performs final verification and final review',    TRUE),
        ('DIRECTOR',       'FAD Director',             'مدير الإدارة',   'Approves, rejects, or returns requests',          TRUE),
        ('TYPIST',         'FAD Typist',               'كاتب الإدارة',   'Processes embassy applications, updates fees',    TRUE),
        ('EMBASSY',        'Embassy',                  'السفارة',        'Embassy user processes visa applications',        TRUE)
      ON CONFLICT (code) DO NOTHING
    `);

    await qr.query(`
      INSERT INTO users.visa_types (code, name_en, name_ar) VALUES
        ('TOURIST',    'Tourist Visa',    'تأشيرة سياحية'),
        ('BUSINESS',   'Business Visa',   'تأشيرة عمل'),
        ('DIPLOMATIC', 'Diplomatic Visa', 'تأشيرة دبلوماسية'),
        ('OFFICIAL',   'Official Visa',   'تأشيرة رسمية'),
        ('TRANSIT',    'Transit Visa',    'تأشيرة عبور')
      ON CONFLICT (code) DO NOTHING
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM users.visa_types WHERE code IN ('TOURIST','BUSINESS','DIPLOMATIC','OFFICIAL','TRANSIT')`);
    await qr.query(`DELETE FROM users.personas   WHERE code IN ('OFFICE','SENIOR_ADMIN','SENIOR_OFFICER','DIRECTOR','TYPIST')`);
  }
}
