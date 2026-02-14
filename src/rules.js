const db = require('./db');

function normalizeNames(values) {
  return (values || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
}

function hasAny(haystack, needles) {
  const set = new Set(haystack);
  return needles.some((n) => set.has(n));
}

function hasAll(haystack, needles) {
  const set = new Set(haystack);
  return needles.every((n) => set.has(n));
}

function matchesConditions(conditions, ctx) {
  const enemyNames = normalizeNames(ctx.enemies);
  const allyNames = normalizeNames(ctx.allies);
  const currentItems = normalizeNames(ctx.current_items);

  const enemyAny = normalizeNames(conditions.enemy_names_any);
  const enemyAll = normalizeNames(conditions.enemy_names_all);
  const allyAny = normalizeNames(conditions.ally_names_any);
  const currentHasAny = normalizeNames(conditions.current_items_has_any);
  const currentMissingAll = normalizeNames(conditions.current_items_missing_all);

  if (enemyAny.length > 0 && !hasAny(enemyNames, enemyAny)) {
    return false;
  }
  if (enemyAll.length > 0 && !hasAll(enemyNames, enemyAll)) {
    return false;
  }
  if (allyAny.length > 0 && !hasAny(allyNames, allyAny)) {
    return false;
  }
  if (currentHasAny.length > 0 && !hasAny(currentItems, currentHasAny)) {
    return false;
  }
  if (currentMissingAll.length > 0 && hasAny(currentItems, currentMissingAll)) {
    return false;
  }

  if (Number.isFinite(conditions.pos_min) && ctx.pos < conditions.pos_min) {
    return false;
  }
  if (Number.isFinite(conditions.pos_max) && ctx.pos > conditions.pos_max) {
    return false;
  }
  if (Number.isFinite(conditions.time_s_min) && ctx.time_s < conditions.time_s_min) {
    return false;
  }
  if (Number.isFinite(conditions.time_s_max) && ctx.time_s > conditions.time_s_max) {
    return false;
  }

  return true;
}

function dedupe(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function applyAdjustment(list, adjustment) {
  const removeSet = new Set((adjustment.remove || []).map((x) => x.trim().toLowerCase()));
  const kept = list.filter((item) => !removeSet.has(item.trim().toLowerCase()));
  return dedupe([...kept, ...(adjustment.add || [])]);
}

async function getRules() {
  const { rows } = await db.query(
    `SELECT id, name, priority, conditions, actions
     FROM rules
     WHERE enabled = TRUE
     ORDER BY priority ASC, id ASC`
  );
  return rows;
}

async function applyRules(baseline, context) {
  const rules = await getRules();
  const final = {
    starting: [...(baseline.starting || [])],
    early: [...baseline.early],
    mid: [...baseline.mid],
    late: [...baseline.late]
  };

  const adjustments = [];

  for (const rule of rules) {
    const conditions = rule.conditions || {};
    if (!matchesConditions(conditions, context)) {
      continue;
    }

    const actionList = (rule.actions && rule.actions.adjustments) || [];
    for (const action of actionList) {
      const stage = String(action.stage || '').toLowerCase();
      if (!['starting', 'early', 'mid', 'late'].includes(stage)) {
        continue;
      }

      const add = dedupe(action.add || []);
      const remove = dedupe(action.remove || []);
      final[stage] = applyAdjustment(final[stage], { add, remove });
      adjustments.push({
        reason: action.reason || rule.name || `rule_${rule.id}`,
        stage,
        add,
        remove
      });
    }
  }

  return { final, adjustments };
}

module.exports = {
  applyRules
};
