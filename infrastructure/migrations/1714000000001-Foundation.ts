import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 001 — Foundational extensions and schema namespaces.
 *
 * Splitting init.sql into discrete, reversible migrations makes production
 * deploys safe (run only what's new) and rollbacks possible.
 *
 * Run order: 001 → 002 → 003 → 004. Each service's CI runs only the migrations
 * relevant to its schema, in the right order, by reading the timestamp prefix.
 */
export class Foundation0001 implements MigrationInterface {
  name = 'Foundation0001';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await qr.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await qr.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);

    await qr.query(`CREATE SCHEMA IF NOT EXISTS auth`);
    await qr.query(`CREATE SCHEMA IF NOT EXISTS users`);
    await qr.query(`CREATE SCHEMA IF NOT EXISTS requests`);
    await qr.query(`CREATE SCHEMA IF NOT EXISTS workflow`);
    await qr.query(`CREATE SCHEMA IF NOT EXISTS documents`);
    await qr.query(`CREATE SCHEMA IF NOT EXISTS notifications`);
    await qr.query(`CREATE SCHEMA IF NOT EXISTS reporting`);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Schemas dropped only if explicitly requested — destructive
    await qr.query(`DROP SCHEMA IF EXISTS reporting CASCADE`);
    await qr.query(`DROP SCHEMA IF EXISTS notifications CASCADE`);
    await qr.query(`DROP SCHEMA IF EXISTS documents CASCADE`);
    await qr.query(`DROP SCHEMA IF EXISTS workflow CASCADE`);
    await qr.query(`DROP SCHEMA IF EXISTS requests CASCADE`);
    await qr.query(`DROP SCHEMA IF EXISTS users CASCADE`);
    await qr.query(`DROP SCHEMA IF EXISTS auth CASCADE`);
    // Extensions left in place — they're shared
  }
}
