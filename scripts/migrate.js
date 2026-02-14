const fs = require('fs');
const path = require('path');

const db = require('../src/db');

async function ensureSchemaMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const { rows } = await db.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((row) => row.version));
}

async function applyMigration(version, sql) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [version]);
    await client.query('COMMIT');
    console.log(`Applied migration: ${version}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  await ensureSchemaMigrations();
  const applied = await getAppliedMigrations();

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    await applyMigration(file, sql);
  }

  await db.pool.end();
  console.log('Migrations complete');
}

run().catch(async (error) => {
  console.error(error);
  await db.pool.end();
  process.exit(1);
});