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

module.exports = {
  port: asInt('PORT', 3000),
  databaseUrl: required('DATABASE_URL'),
  itemConstantsTtlSeconds: asInt('ITEM_CONSTANTS_TTL_SECONDS', 86400),
  heroMetaTtlSeconds: asInt('HERO_META_TTL_SECONDS', 2700),
  requestsPerMinute: asInt('REQUESTS_PER_MINUTE', 120),
  hotHeroes: (process.env.HOT_HEROES || '')
    .split(',')
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((x) => Number.isInteger(x) && x > 0)
};