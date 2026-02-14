require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function asInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
}

function buildDatabaseUrlFromPgVars() {
  const host = process.env.PGHOST;
  const port = process.env.PGPORT || '5432';
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (!host || !database || !user || !password) {
    return '';
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);
  return `postgres://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}`;
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const fallback = buildDatabaseUrlFromPgVars();
  if (fallback) {
    return fallback;
  }

  throw new Error(
    'Missing required database configuration: set DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD'
  );
}

module.exports = {
  port: asInt('PORT', 3000),
  databaseUrl: resolveDatabaseUrl(),
  itemConstantsTtlSeconds: asInt('ITEM_CONSTANTS_TTL_SECONDS', 86400),
  heroMetaTtlSeconds: asInt('HERO_META_TTL_SECONDS', 2700),
  requestsPerMinute: asInt('REQUESTS_PER_MINUTE', 120),
  hotHeroes: (process.env.HOT_HEROES || '')
    .split(',')
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((x) => Number.isInteger(x) && x > 0)
};
