const db = require('./db');
const config = require('./config');
const { fetchItemsConstants, fetchHeroItemPopularity } = require('./opendota');

function isFresh(updatedAtIso, ttlSeconds) {
  if (!updatedAtIso) {
    return false;
  }
  const updatedAt = new Date(updatedAtIso).getTime();
  const maxAgeMs = ttlSeconds * 1000;
  return Date.now() - updatedAt <= maxAgeMs;
}

function toItemIdMap(constantsPayload) {
  const map = {};
  for (const [itemName, details] of Object.entries(constantsPayload || {})) {
    if (details && Number.isInteger(details.id)) {
      map[String(details.id)] = itemName.startsWith('item_') ? itemName : `item_${itemName}`;
    }
  }
  return map;
}

function topItemNames(popularityStage, itemIdMap, max) {
  return Object.entries(popularityStage || {})
    .filter(([, score]) => Number.isFinite(score))
    .sort((a, b) => b[1] - a[1])
    .map(([itemId]) => itemIdMap[String(itemId)])
    .filter(Boolean)
    .filter((name, index, arr) => arr.indexOf(name) === index)
    .slice(0, max);
}

async function getCachedItemIdMap() {
  const { rows } = await db.query(
    'SELECT item_id_map, updated_at FROM cache_items_constants WHERE id = 1'
  );
  return rows[0] || null;
}

async function upsertItemIdMap(itemIdMap) {
  await db.query(
    `INSERT INTO cache_items_constants (id, item_id_map, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id)
     DO UPDATE SET item_id_map = EXCLUDED.item_id_map, updated_at = NOW()`,
    [JSON.stringify(itemIdMap)]
  );
}

async function ensureItemIdMap(forceRefresh = false) {
  const cached = await getCachedItemIdMap();

  if (!forceRefresh && cached && isFresh(cached.updated_at, config.itemConstantsTtlSeconds)) {
    return { source: 'cache', itemIdMap: cached.item_id_map, updatedAt: cached.updated_at };
  }

  try {
    const constants = await fetchItemsConstants();
    const itemIdMap = toItemIdMap(constants);
    await upsertItemIdMap(itemIdMap);
    return { source: 'opendota', itemIdMap, updatedAt: new Date().toISOString() };
  } catch (error) {
    if (cached) {
      return { source: 'stale_cache', itemIdMap: cached.item_id_map, updatedAt: cached.updated_at };
    }
    throw error;
  }
}

async function getCachedHeroMeta(heroId) {
  const { rows } = await db.query(
    `SELECT hero_id, starting_items, early_items, mid_items, late_items, updated_at
     FROM cache_hero_item_popularity
     WHERE hero_id = $1`,
    [heroId]
  );
  return rows[0] || null;
}

async function upsertHeroMeta(heroId, startingItems, earlyItems, midItems, lateItems) {
  await db.query(
    `INSERT INTO cache_hero_item_popularity (hero_id, starting_items, early_items, mid_items, late_items, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, NOW())
     ON CONFLICT (hero_id)
     DO UPDATE SET starting_items = EXCLUDED.starting_items,
                   early_items = EXCLUDED.early_items,
                   mid_items = EXCLUDED.mid_items,
                   late_items = EXCLUDED.late_items,
                   updated_at = NOW()`,
    [
      heroId,
      JSON.stringify(startingItems),
      JSON.stringify(earlyItems),
      JSON.stringify(midItems),
      JSON.stringify(lateItems)
    ]
  );
}

function normalizeStage(popularityPayload, itemIdMap, max) {
  const starting = topItemNames(popularityPayload.start_game_items, itemIdMap, max);
  const early = topItemNames(popularityPayload.early_game_items, itemIdMap, max);
  const mid = topItemNames(popularityPayload.mid_game_items, itemIdMap, max);
  const late = topItemNames(popularityPayload.late_game_items, itemIdMap, max);
  return { starting, early, mid, late };
}

async function getHeroMeta(heroId, max = 6, forceRefresh = false) {
  const constants = await ensureItemIdMap(forceRefresh);
  const cached = await getCachedHeroMeta(heroId);

  if (!forceRefresh && cached && isFresh(cached.updated_at, config.heroMetaTtlSeconds)) {
    return {
      source: 'cache',
      heroId,
      updatedAt: cached.updated_at,
      starting: (cached.starting_items || []).slice(0, max),
      early: (cached.early_items || []).slice(0, max),
      mid: (cached.mid_items || []).slice(0, max),
      late: (cached.late_items || []).slice(0, max)
    };
  }

  try {
    const popularity = await fetchHeroItemPopularity(heroId);
    const stages = normalizeStage(popularity, constants.itemIdMap, Math.max(max, 10));
    await upsertHeroMeta(heroId, stages.starting, stages.early, stages.mid, stages.late);

    return {
      source: forceRefresh ? 'opendota_forced' : 'opendota',
      heroId,
      updatedAt: new Date().toISOString(),
      starting: stages.starting.slice(0, max),
      early: stages.early.slice(0, max),
      mid: stages.mid.slice(0, max),
      late: stages.late.slice(0, max)
    };
  } catch (error) {
    if (cached) {
      return {
        source: 'stale_cache',
        heroId,
        updatedAt: cached.updated_at,
        starting: (cached.starting_items || []).slice(0, max),
        early: (cached.early_items || []).slice(0, max),
        mid: (cached.mid_items || []).slice(0, max),
        late: (cached.late_items || []).slice(0, max)
      };
    }
    throw error;
  }
}

async function getHotHeroes() {
  const { rows } = await db.query('SELECT hero_id FROM hot_heroes ORDER BY hero_id ASC');
  if (rows.length > 0) {
    return rows.map((r) => r.hero_id);
  }
  return config.hotHeroes;
}

async function refreshHotHeroes(maxItems = 6) {
  const heroes = await getHotHeroes();
  await ensureItemIdMap(true);

  const refreshed = [];
  for (const heroId of heroes) {
    try {
      const meta = await getHeroMeta(heroId, maxItems, true);
      refreshed.push({ hero_id: heroId, status: 'ok', updated_at: meta.updatedAt });
    } catch (error) {
      refreshed.push({ hero_id: heroId, status: 'error', error: error.message });
    }
  }

  return refreshed;
}

module.exports = {
  getHeroMeta,
  refreshHotHeroes,
  ensureItemIdMap
};
