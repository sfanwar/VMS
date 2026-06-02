import { DataSource } from 'typeorm';
import { Foundation0001 } from './1714000000001-Foundation';
import { CoreDomain0002 } from './1714000000002-CoreDomain';
import { WorkflowDocsNotifications0003 } from './1714000000003-WorkflowDocsNotifications';
import { SystemReferenceData0004 } from './1714000000004-SystemReferenceData';

/**
 * DataSource for the migration CLI.
 *
 * Used as: `typeorm migration:run -d infrastructure/migrations/data-source.ts`
 *
 * Reads DATABASE_URL from env. Falls back to local docker-compose defaults.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgres://visa_admin:change-me-postgres@localhost:5432/visa_management',
  migrationsTableName: 'vms_migrations',
  migrations: [
    Foundation0001,
    CoreDomain0002,
    WorkflowDocsNotifications0003,
    SystemReferenceData0004,
  ],
  entities: [],
  synchronize: false,
  logging: ['migration', 'error'],
});
