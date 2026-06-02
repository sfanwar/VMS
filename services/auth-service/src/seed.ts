import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';

/**
 * Seeds five test users (one per persona) with password "Passw0rd!".
 * Run: npm run seed
 * Idempotent — re-running is safe.
 */
async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgres://visa_admin:change-me-postgres@localhost:5432/visa_management',
    schema: 'auth',
  });

  await ds.initialize();
  // eslint-disable-next-line no-console
  console.log('Connected to database');

  // Seed sample offices (in users schema). Each carries an authorized person
  // and telephone number that the request-create form auto-populates on selection.
  const sampleOffices: Array<[string, string, string, string]> = [
    // [name_en, name_ar, authorized_person, telephone_number]
    ['Office One',                'المكتب الأول',              'Ahmed Al Mansouri',   '+971-4-1234567'],
    ['Riyadh Liaison Office',     'مكتب الرياض للاتصال',        'Fatima Al Saud',      '+966-11-2345678'],
    ['Cairo Mission Office',      'مكتب بعثة القاهرة',          'Mahmoud Hassan',      '+20-2-33445566'],
    ['London Consular Desk',      'القسم القنصلي بلندن',        'Sarah Williams',      '+44-20-79460000'],
    ['Paris Liaison Office',      'مكتب باريس للاتصال',         'Jean-Pierre Dubois',  '+33-1-44550011'],
    ['Tokyo Mission Office',      'مكتب بعثة طوكيو',            'Kenji Tanaka',        '+81-3-92011234'],
    ['Berlin Consular Desk',      'القسم القنصلي ببرلين',       'Anna Schmidt',        '+49-30-88990011'],
    ['Geneva Liaison Office',     'مكتب جنيف للاتصال',          'Marco Rossi',         '+41-22-7654321'],
    ['Washington Mission Office', 'مكتب بعثة واشنطن',           'Robert Johnson',      '+1-202-5550100'],
    ['Ottawa Consular Desk',      'القسم القنصلي بأوتاوا',      'Emily Tremblay',      '+1-613-5550199'],
    ['Moscow Liaison Office',     'مكتب موسكو للاتصال',         'Dmitri Volkov',       '+7-495-7654321'],
    ['Beijing Mission Office',    'مكتب بعثة بكين',             'Li Wei',              '+86-10-65001234'],
    ['New Delhi Consular Desk',   'القسم القنصلي بنيودلهي',     'Priya Sharma',        '+91-11-23456789'],
    ['Rome Liaison Office',       'مكتب روما للاتصال',          'Giulia Bianchi',      '+39-06-48901234'],
    ['Madrid Mission Office',     'مكتب بعثة مدريد',            'Carlos Fernández',    '+34-91-5550123'],
    ['Ankara Consular Desk',      'القسم القنصلي بأنقرة',       'Mehmet Yılmaz',       '+90-312-4567890'],
    ['Islamabad Liaison Office',  'مكتب إسلام آباد للاتصال',    'Imran Khan',          '+92-51-2345678'],
    ['Jakarta Mission Office',    'مكتب بعثة جاكرتا',           'Siti Rahayu',         '+62-21-39001234'],
    ['Kuala Lumpur Consular Desk','القسم القنصلي بكوالالمبور',  'Ahmad Faisal',        '+60-3-20001234'],
    ['Nairobi Liaison Office',    'مكتب نيروبي للاتصال',        'Grace Wanjiru',       '+254-20-2345678'],
  ];

  // Remove any duplicate offices left by earlier seed runs (same name_en,
  // different id) — keep the earliest row of each name, repoint any users that
  // referenced a now-removed duplicate to the surviving office.
  await ds.query(`
    WITH ranked AS (
      SELECT id, name_en,
             ROW_NUMBER() OVER (PARTITION BY name_en ORDER BY created_at, id) AS rn,
             FIRST_VALUE(id) OVER (PARTITION BY name_en ORDER BY created_at, id) AS keep_id
      FROM users.offices
    )
    UPDATE users.users u
    SET office_id = r.keep_id
    FROM ranked r
    WHERE u.office_id = r.id AND r.rn > 1
  `);
  await ds.query(`
    DELETE FROM users.offices o
    USING (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY name_en ORDER BY created_at, id) AS rn
      FROM users.offices
    ) d
    WHERE o.id = d.id AND d.rn > 1
  `);

  let officeId = uuid();
  for (const [nameEn, nameAr, authorizedPerson, telephone] of sampleOffices) {
    // Insert only if an office with this name doesn't already exist. This is
    // idempotent without relying on a DB unique constraint, so it works on
    // both fresh databases and ones created before the constraint was added.
    await ds.query(
      `INSERT INTO users.offices (id, name_en, name_ar, authorized_person, telephone_number)
       SELECT $1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar
       WHERE NOT EXISTS (SELECT 1 FROM users.offices WHERE name_en = $2::varchar)`,
      [uuid(), nameEn, nameAr, authorizedPerson, telephone],
    );
  }

  // Seed authorized contact persons per office (BRD §5.2 — an office may have
  // several). Every office gets its primary contact (mirrored from the office's
  // authorized_person); a few offices get additional contacts to exercise the
  // request-create sub-dropdown. Idempotent via UNIQUE (office_id, name).
  const extraContacts: Record<string, Array<[string, string]>> = {
    // name_en -> [ [contact_name, telephone], ... ]
    'Office One':            [['Layla Al Hashimi', '+971-4-1234568'], ['Omar Abdullah', '+971-4-1234569']],
    'Riyadh Liaison Office': [['Khalid Al Otaibi', '+966-11-2345679']],
    'Cairo Mission Office':  [['Nadia Fawzy', '+20-2-33445567']],
    'London Consular Desk':  [['James Carter', '+44-20-79460001']],
  };

  const officeRows: Array<{ id: string; name_en: string }> = await ds.query(
    `SELECT id, name_en FROM users.offices`,
  );
  const telByName = new Map(sampleOffices.map(([nameEn, , person, tel]) => [nameEn, { person, tel }]));
  for (const office of officeRows) {
    const primary = telByName.get(office.name_en);
    const rows: Array<[string, string, boolean]> = [];
    if (primary) rows.push([primary.person, primary.tel, true]);
    for (const [name, tel] of extraContacts[office.name_en] ?? []) rows.push([name, tel, false]);
    for (const [name, tel, isPrimary] of rows) {
      await ds.query(
        `INSERT INTO users.office_contacts (office_id, name, telephone_number, is_primary)
         VALUES ($1::uuid, $2::varchar, $3::varchar, $4::boolean)
         ON CONFLICT (office_id, name) DO NOTHING`,
        [office.id, name, tel, isPrimary],
      );
    }
  }

  // Lookup the office that the seeded office user belongs to
  const officeRow = await ds.query(`SELECT id FROM users.offices WHERE name_en = 'Office One' LIMIT 1`);
  const realOfficeId = officeRow[0]?.id ?? officeId;

  const users = [
    { email: 'office.user@office1.local', name: 'Office User', persona: 'OFFICE', office: realOfficeId },
    { email: 'senior.admin@fad.local', name: 'Senior Administrator', persona: 'SENIOR_ADMIN', office: null },
    { email: 'senior.officer@fad.local', name: 'Senior Officer', persona: 'SENIOR_OFFICER', office: null },
    { email: 'director@fad.local', name: 'Department Director', persona: 'DIRECTOR', office: null },
    { email: 'typist@fad.local', name: 'Department Typist', persona: 'TYPIST', office: null },
    { email: 'embassy.user@embassy.local', name: 'Embassy User', persona: 'EMBASSY', office: null },
    { email: 'sysadmin@fad.local', name: 'System Administrator', persona: 'SYSADMIN', office: null },
  ];

  const passwordHash = await bcrypt.hash('Passw0rd!', 12);

  for (const u of users) {
    // Create user in users schema
    const userId = uuid();
    const existingUser = await ds.query(`SELECT id FROM users.users WHERE email = $1`, [u.email]);
    const finalUserId: string = existingUser[0]?.id ?? userId;

    if (existingUser.length === 0) {
      await ds.query(
        `INSERT INTO users.users (id, email, full_name_en, office_id) VALUES ($1, $2, $3, $4)`,
        [userId, u.email, u.name, u.office],
      );
    }

    // Assign persona
    await ds.query(
      `INSERT INTO users.user_personas (user_id, persona_id)
       SELECT $1, id FROM users.personas WHERE code = $2
       ON CONFLICT DO NOTHING`,
      [finalUserId, u.persona],
    );

    // Credential
    await ds.query(
      `INSERT INTO auth.credentials (user_id, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [finalUserId, u.email, passwordHash],
    );

    // eslint-disable-next-line no-console
    console.log(`  Seeded ${u.email} (${u.persona})`);
  }

  // Seed a few countries
  const countries = [
    ['US', 'United States', 'الولايات المتحدة'],
    ['GB', 'United Kingdom', 'المملكة المتحدة'],
    ['FR', 'France', 'فرنسا'],
    ['DE', 'Germany', 'ألمانيا'],
    ['JP', 'Japan', 'اليابان'],
  ];
  for (const [iso, en, ar] of countries) {
    await ds.query(
      `INSERT INTO users.countries (iso_code, name_en, name_ar) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [iso, en, ar],
    );
  }
  // eslint-disable-next-line no-console
  console.log('Seed complete. All accounts use password: Passw0rd!');

  await ds.destroy();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
