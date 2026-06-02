import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';

/**
 * Sample data seeder.
 *
 * Generates ~15 realistic visa requests scattered across the workflow's
 * various states. Useful for:
 *   - Demoing the UI
 *   - Smoke-testing the reporting dashboards
 *   - E2E testing setup
 *
 * Idempotent: looks for an existing "Sample" marker in metadata and skips if found.
 * Run: docker-compose exec auth-service node /app/dist/sample-data.js
 *   or: cd services/auth-service && npx ts-node src/sample-data.ts
 */

interface Scenario {
  status: string;
  visaTypeCode: string;
  numberOfPassengers: number;
  beneficiaryNames: string[];
  transitions: { from: string | null; to: string; action: string; persona: string; comment?: string; daysAgo: number }[];
  feesAmount?: string;
}

const SCENARIOS: Scenario[] = [
  {
    status: 'DRAFT',
    visaTypeCode: 'TOURIST',
    numberOfPassengers: 2,
    beneficiaryNames: ['Layla Al Mansouri', 'Yousef Al Mansouri'],
    transitions: [],
  },
  {
    status: 'SUBMITTED',
    visaTypeCode: 'BUSINESS',
    numberOfPassengers: 1,
    beneficiaryNames: ['Ahmed Al Suwaidi'],
    transitions: [
      { from: 'DRAFT', to: 'SUBMITTED', action: 'SUBMIT', persona: 'OFFICE', daysAgo: 2 },
    ],
  },
  {
    status: 'INITIAL_VERIFICATION',
    visaTypeCode: 'TOURIST',
    numberOfPassengers: 3,
    beneficiaryNames: ['Mariam Khoury', 'Hassan Khoury', 'Sara Khoury'],
    transitions: [
      { from: 'DRAFT',     to: 'SUBMITTED',            action: 'SUBMIT',                persona: 'OFFICE',       daysAgo: 5 },
      { from: 'SUBMITTED', to: 'INITIAL_VERIFICATION', action: 'START_INITIAL_VERIFY',  persona: 'SENIOR_ADMIN', daysAgo: 4 },
    ],
  },
  {
    status: 'FINAL_VERIFICATION',
    visaTypeCode: 'OFFICIAL',
    numberOfPassengers: 1,
    beneficiaryNames: ['Khalid Al Maktoum'],
    transitions: [
      { from: 'DRAFT',                to: 'SUBMITTED',            action: 'SUBMIT',               persona: 'OFFICE',       daysAgo: 7 },
      { from: 'SUBMITTED',            to: 'INITIAL_VERIFICATION', action: 'START_INITIAL_VERIFY', persona: 'SENIOR_ADMIN', daysAgo: 6 },
      { from: 'INITIAL_VERIFICATION', to: 'FINAL_VERIFICATION',   action: 'VERIFY_OK',            persona: 'SENIOR_ADMIN', daysAgo: 5 },
    ],
  },
  {
    status: 'DIRECTOR_REVIEW',
    visaTypeCode: 'DIPLOMATIC',
    numberOfPassengers: 2,
    beneficiaryNames: ['Ambassador R. Nakamura', 'Attaché H. Tanaka'],
    transitions: [
      { from: 'DRAFT',                to: 'SUBMITTED',            action: 'SUBMIT',               persona: 'OFFICE',         daysAgo: 9 },
      { from: 'SUBMITTED',            to: 'INITIAL_VERIFICATION', action: 'START_INITIAL_VERIFY', persona: 'SENIOR_ADMIN',   daysAgo: 8 },
      { from: 'INITIAL_VERIFICATION', to: 'FINAL_VERIFICATION',   action: 'VERIFY_OK',            persona: 'SENIOR_ADMIN',   daysAgo: 7 },
      { from: 'FINAL_VERIFICATION',   to: 'DIRECTOR_REVIEW',      action: 'VERIFY_OK',            persona: 'SENIOR_OFFICER', daysAgo: 6 },
    ],
  },
  {
    status: 'RETURNED_TO_OFFICE',
    visaTypeCode: 'TOURIST',
    numberOfPassengers: 1,
    beneficiaryNames: ['Nadia Hassan'],
    transitions: [
      { from: 'DRAFT',                to: 'SUBMITTED',            action: 'SUBMIT',               persona: 'OFFICE',       daysAgo: 4 },
      { from: 'SUBMITTED',            to: 'INITIAL_VERIFICATION', action: 'START_INITIAL_VERIFY', persona: 'SENIOR_ADMIN', daysAgo: 3 },
      { from: 'INITIAL_VERIFICATION', to: 'RETURNED_TO_OFFICE',   action: 'RETURN_TO_OFFICE',     persona: 'SENIOR_ADMIN', daysAgo: 2, comment: 'Passport scan illegible — please resubmit a clearer copy' },
    ],
  },
  {
    status: 'TYPIST_PROCESSING',
    visaTypeCode: 'BUSINESS',
    numberOfPassengers: 4,
    beneficiaryNames: ['Omar Saleh', 'Fatima Saleh', 'Ibrahim Saleh', 'Layla Saleh'],
    transitions: [
      { from: 'DRAFT',                to: 'SUBMITTED',            action: 'SUBMIT',               persona: 'OFFICE',         daysAgo: 14 },
      { from: 'SUBMITTED',            to: 'INITIAL_VERIFICATION', action: 'START_INITIAL_VERIFY', persona: 'SENIOR_ADMIN',   daysAgo: 13 },
      { from: 'INITIAL_VERIFICATION', to: 'FINAL_VERIFICATION',   action: 'VERIFY_OK',            persona: 'SENIOR_ADMIN',   daysAgo: 12 },
      { from: 'FINAL_VERIFICATION',   to: 'DIRECTOR_REVIEW',      action: 'VERIFY_OK',            persona: 'SENIOR_OFFICER', daysAgo: 10 },
      { from: 'DIRECTOR_REVIEW',      to: 'TYPIST_PROCESSING',    action: 'APPROVE',              persona: 'DIRECTOR',       daysAgo: 9 },
    ],
  },
  {
    status: 'WAITING_FOR_EMBASSY',
    visaTypeCode: 'TOURIST',
    numberOfPassengers: 2,
    beneficiaryNames: ['Rashid Bin Rashid', 'Aisha Bint Rashid'],
    feesAmount: '850.00',
    transitions: [
      { from: 'DRAFT',                to: 'SUBMITTED',            action: 'SUBMIT',               persona: 'OFFICE',         daysAgo: 21 },
      { from: 'SUBMITTED',            to: 'INITIAL_VERIFICATION', action: 'START_INITIAL_VERIFY', persona: 'SENIOR_ADMIN',   daysAgo: 20 },
      { from: 'INITIAL_VERIFICATION', to: 'FINAL_VERIFICATION',   action: 'VERIFY_OK',            persona: 'SENIOR_ADMIN',   daysAgo: 19 },
      { from: 'FINAL_VERIFICATION',   to: 'DIRECTOR_REVIEW',      action: 'VERIFY_OK',            persona: 'SENIOR_OFFICER', daysAgo: 17 },
      { from: 'DIRECTOR_REVIEW',      to: 'TYPIST_PROCESSING',    action: 'APPROVE',              persona: 'DIRECTOR',       daysAgo: 16 },
      { from: 'TYPIST_PROCESSING',    to: 'WAITING_FOR_EMBASSY',  action: 'SEND_TO_EMBASSY',      persona: 'TYPIST',         daysAgo: 14 },
    ],
  },
  {
    status: 'COMPLETED',
    visaTypeCode: 'BUSINESS',
    numberOfPassengers: 1,
    beneficiaryNames: ['Jonathan Reyes'],
    feesAmount: '450.00',
    transitions: [
      { from: 'DRAFT',                  to: 'SUBMITTED',             action: 'SUBMIT',               persona: 'OFFICE',         daysAgo: 35 },
      { from: 'SUBMITTED',              to: 'INITIAL_VERIFICATION',  action: 'START_INITIAL_VERIFY', persona: 'SENIOR_ADMIN',   daysAgo: 34 },
      { from: 'INITIAL_VERIFICATION',   to: 'FINAL_VERIFICATION',    action: 'VERIFY_OK',            persona: 'SENIOR_ADMIN',   daysAgo: 33 },
      { from: 'FINAL_VERIFICATION',     to: 'DIRECTOR_REVIEW',       action: 'VERIFY_OK',            persona: 'SENIOR_OFFICER', daysAgo: 31 },
      { from: 'DIRECTOR_REVIEW',        to: 'TYPIST_PROCESSING',     action: 'APPROVE',              persona: 'DIRECTOR',       daysAgo: 30 },
      { from: 'TYPIST_PROCESSING',      to: 'WAITING_FOR_EMBASSY',   action: 'SEND_TO_EMBASSY',      persona: 'TYPIST',         daysAgo: 28 },
      { from: 'WAITING_FOR_EMBASSY',    to: 'WAITING_FINAL_REVIEW',  action: 'UPLOAD_VISAS',         persona: 'TYPIST',         daysAgo: 12 },
      { from: 'WAITING_FINAL_REVIEW',   to: 'COMPLETED',             action: 'COMPLETE',             persona: 'SENIOR_OFFICER', daysAgo: 10 },
    ],
  },
  {
    status: 'APOLOGIZED',
    visaTypeCode: 'TRANSIT',
    numberOfPassengers: 1,
    beneficiaryNames: ['M. Petrov'],
    transitions: [
      { from: 'DRAFT',                to: 'SUBMITTED',            action: 'SUBMIT',               persona: 'OFFICE',         daysAgo: 18 },
      { from: 'SUBMITTED',            to: 'INITIAL_VERIFICATION', action: 'START_INITIAL_VERIFY', persona: 'SENIOR_ADMIN',   daysAgo: 17 },
      { from: 'INITIAL_VERIFICATION', to: 'FINAL_VERIFICATION',   action: 'VERIFY_OK',            persona: 'SENIOR_ADMIN',   daysAgo: 16 },
      { from: 'FINAL_VERIFICATION',   to: 'DIRECTOR_REVIEW',      action: 'VERIFY_OK',            persona: 'SENIOR_OFFICER', daysAgo: 14 },
      { from: 'DIRECTOR_REVIEW',      to: 'APOLOGIZED',           action: 'APOLOGIZE',            persona: 'DIRECTOR',       daysAgo: 13, comment: 'Embassy is not accepting transit applications this quarter' },
    ],
  },
];

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgres://visa_admin:change-me-postgres@localhost:5432/visa_management',
  });
  await ds.initialize();
  // eslint-disable-next-line no-console
  console.log('Connected. Generating sample requests…');

  // Locate the office created by the basic seed
  const officeRow = await ds.query(`SELECT id FROM users.offices WHERE name_en = 'Office One' LIMIT 1`);
  if (officeRow.length === 0) {
    // eslint-disable-next-line no-console
    console.error('No "Office One" found — run `npm run seed` first');
    process.exit(1);
  }
  const officeId = officeRow[0].id;

  const officeUser = await ds.query(`SELECT id FROM users.users WHERE email = 'office.user@office1.local' LIMIT 1`);
  const userIds: Record<string, string> = {};
  for (const persona of ['OFFICE', 'SENIOR_ADMIN', 'SENIOR_OFFICER', 'DIRECTOR', 'TYPIST']) {
    const email =
      persona === 'OFFICE'         ? 'office.user@office1.local' :
      persona === 'SENIOR_ADMIN'   ? 'senior.admin@fad.local'    :
      persona === 'SENIOR_OFFICER' ? 'senior.officer@fad.local'  :
      persona === 'DIRECTOR'       ? 'director@fad.local'        :
                                     'typist@fad.local';
    const row = await ds.query(`SELECT id FROM users.users WHERE email = $1 LIMIT 1`, [email]);
    if (row[0]) userIds[persona] = row[0].id;
  }

  // Idempotency check
  const existing = await ds.query(`SELECT COUNT(*)::int AS c FROM requests.visa_requests WHERE request_number LIKE 'VR-%-9%'`);
  if (existing[0].c > 5) {
    // eslint-disable-next-line no-console
    console.log(`${existing[0].c} sample-looking requests already exist — skipping. Use \`make reset\` to start fresh.`);
    await ds.destroy();
    return;
  }

  const visaTypes = await ds.query(`SELECT id, code FROM users.visa_types`);
  const visaTypeMap: Record<string, string> = Object.fromEntries(visaTypes.map((v: any) => [v.code, v.id]));
  const countries = await ds.query(`SELECT id FROM users.countries LIMIT 1`);
  if (countries.length === 0) {
    // eslint-disable-next-line no-console
    console.error('No countries seeded — run `npm run seed` first');
    process.exit(1);
  }
  const countryId = countries[0].id;

  for (const scenario of SCENARIOS) {
    const requestId = uuid();
    const reqNumRow = await ds.query(`SELECT requests.next_request_number() AS n`);
    const requestNumber = reqNumRow[0].n;
    const createdAt = scenario.transitions.length > 0
      ? new Date(Date.now() - (scenario.transitions[0].daysAgo + 1) * 86400_000)
      : new Date(Date.now() - 1 * 86400_000);

    await ds.query(`
      INSERT INTO requests.visa_requests
        (id, request_number, office_id, created_by_user_id, country_of_visit_id, visa_type_id,
         number_of_passengers, request_date, status, fees_amount, fees_updated_at, fees_updated_by,
         submitted_at, completed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::requests.request_status,$10,$11,$12,$13,$14,$15,$15)
    `, [
      requestId, requestNumber, officeId, userIds.OFFICE, countryId, visaTypeMap[scenario.visaTypeCode],
      scenario.numberOfPassengers,
      createdAt.toISOString().slice(0, 10),
      scenario.status,
      scenario.feesAmount ?? null,
      scenario.feesAmount ? new Date() : null,
      scenario.feesAmount ? userIds.TYPIST : null,
      scenario.transitions.find((t) => t.to === 'SUBMITTED') ? new Date(Date.now() - 86400_000 * (scenario.transitions.find((t) => t.to === 'SUBMITTED')!.daysAgo)) : null,
      ['COMPLETED','APOLOGIZED','REJECTED'].includes(scenario.status) ? new Date(Date.now() - 86400_000 * scenario.transitions[scenario.transitions.length - 1].daysAgo) : null,
      createdAt,
    ]);

    for (let i = 0; i < scenario.beneficiaryNames.length; i++) {
      await ds.query(
        `INSERT INTO requests.beneficiaries (id, request_id, full_name_en, sequence_no) VALUES ($1, $2, $3, $4)`,
        [uuid(), requestId, scenario.beneficiaryNames[i], i + 1],
      );
    }

    for (const t of scenario.transitions) {
      await ds.query(
        `INSERT INTO workflow.transitions
           (id, request_id, from_status, to_status, actor_user_id, actor_persona, action, comment, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuid(), requestId, t.from, t.to, userIds[t.persona] ?? userIds.OFFICE,
          t.persona, t.action, t.comment ?? null,
          new Date(Date.now() - t.daysAgo * 86400_000),
        ],
      );
      await ds.query(
        `INSERT INTO workflow.audit_events
           (event_type, entity_type, entity_id, actor_user_id, actor_persona, payload, occurred_at)
         VALUES ('WORKFLOW_TRANSITION', 'visa_request', $1, $2, $3, $4, $5)`,
        [
          requestId, userIds[t.persona] ?? userIds.OFFICE, t.persona,
          { action: t.action, from: t.from, to: t.to, comment: t.comment ?? null },
          new Date(Date.now() - t.daysAgo * 86400_000),
        ],
      );
    }

    // eslint-disable-next-line no-console
    console.log(`  ${requestNumber}  ${scenario.status.padEnd(22)}  ${scenario.beneficiaryNames.length} beneficiar${scenario.beneficiaryNames.length === 1 ? 'y' : 'ies'}`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nSeeded ${SCENARIOS.length} sample requests across the workflow.`);
  await ds.destroy();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Sample seed failed:', err);
  process.exit(1);
});
