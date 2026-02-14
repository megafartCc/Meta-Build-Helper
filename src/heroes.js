const { fetchHeroesConstants } = require('./opendota');

const HEROES_TTL_MS = 24 * 60 * 60 * 1000;

let cache = {
  updatedAt: 0,
  byId: {}
};

function parseHeroName(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  if (entry.localized_name && String(entry.localized_name).trim() !== '') {
    return String(entry.localized_name).trim();
  }
  if (entry.name && String(entry.name).trim() !== '') {
    return String(entry.name).replace(/^npc_dota_hero_/, '').trim();
  }
  return '';
}

async function ensureHeroesMap() {
  const fresh = Date.now() - cache.updatedAt < HEROES_TTL_MS;
  if (fresh && Object.keys(cache.byId).length > 0) {
    return cache.byId;
  }

  try {
    const constants = await fetchHeroesConstants();
    const next = {};
    for (const [id, entry] of Object.entries(constants || {})) {
      const heroId = Number.parseInt(id, 10);
      if (!Number.isInteger(heroId)) {
        continue;
      }
      const name = parseHeroName(entry);
      if (name) {
        next[heroId] = name;
      }
    }
    cache = {
      updatedAt: Date.now(),
      byId: next
    };
  } catch (_error) {
    // Keep stale cache on fetch failures.
  }

  return cache.byId;
}

async function getHeroName(heroId) {
  const map = await ensureHeroesMap();
  return map[heroId] || null;
}

module.exports = {
  getHeroName
};
