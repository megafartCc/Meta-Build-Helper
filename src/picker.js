const { normalizeItemName } = require('./util-items');

const STAGES = ['starting', 'early', 'mid', 'late'];

const MODE_ALIASES = [
  { mode: 'magic', re: /\b(magic|magical|caster|spell|ap)\b/i },
  {
    mode: 'magic',
    re: /(\u043c\u0430\u0433|\u043c\u0430\u0433\u0438\u0447|\u043c\u0430\u0433\u0438\u0438|\u043a\u0430\u0441\u0442\u0435\u0440|\u0437\u0430\u043a\u043b\u0438\u043d)/i
  },
  { mode: 'tank', re: /\b(tank|tanky|frontline)\b/i },
  { mode: 'tank', re: /(\u0442\u0430\u043d\u043a|\u0436\u0438\u0440|\u0442\u043e\u043b\u0441\u0442)/i },
  { mode: 'utility', re: /\b(utility|support|save)\b/i },
  {
    mode: 'utility',
    re: /(\u0443\u0442\u0438\u043b|\u0441\u0435\u0439\u0432|\u0441\u0430\u043f\u043f\u043e\u0440\u0442|\u043f\u043e\u0434\u0434\u0435\u0440\u0436)/i
  },
  { mode: 'greed', re: /\b(greed|greedy|farm)\b/i },
  { mode: 'greed', re: /(\u0436\u0430\u0434\u043d|\u0444\u0430\u0440\u043c)/i }
];

const MODE_PREFER = {
  magic: [
    'item_kaya',
    'item_kaya_and_sange',
    'item_yasha_and_kaya',
    'item_octarine_core',
    'item_ultimate_scepter',
    'item_refresher',
    'item_shivas_guard',
    'item_ethereal_blade',
    'item_bloodstone',
    'item_witch_blade',
    'item_parasma',
    'item_sheepstick',
    'item_blink',
    'item_travel_boots'
  ],
  tank: [
    'item_heart',
    'item_shivas_guard',
    'item_assault',
    'item_crimson_guard',
    'item_pipe',
    'item_lotus_orb',
    'item_blade_mail',
    'item_heavens_halberd',
    'item_eternal_shroud',
    'item_black_king_bar'
  ],
  utility: [
    'item_force_staff',
    'item_glimmer_cape',
    'item_lotus_orb',
    'item_solar_crest',
    'item_pipe',
    'item_crimson_guard',
    'item_guardian_greaves',
    'item_spirit_vessel',
    'item_blink',
    'item_smoke_of_deceit'
  ],
  greed: [
    'item_hand_of_midas',
    'item_maelstrom',
    'item_mjollnir',
    'item_radiance',
    'item_battlefury',
    'item_travel_boots',
    'item_black_king_bar'
  ]
};

const GROUP_RANK = {
  item_magic_stick: { group: 'stick', rank: 1 },
  item_magic_wand: { group: 'stick', rank: 2 },
  item_holy_locket: { group: 'stick', rank: 3 },
  item_urn_of_shadows: { group: 'urn', rank: 1 },
  item_spirit_vessel: { group: 'urn', rank: 2 },
  item_yasha: { group: 'yasha_combo', rank: 1 },
  item_sange: { group: 'yasha_combo', rank: 1 },
  item_kaya: { group: 'yasha_combo', rank: 1 },
  item_manta: { group: 'yasha_combo', rank: 2 },
  item_sange_and_yasha: { group: 'yasha_combo', rank: 2 },
  item_kaya_and_sange: { group: 'yasha_combo', rank: 2 },
  item_yasha_and_kaya: { group: 'yasha_combo', rank: 2 }
};

function extractMode(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return '';
  }
  for (const entry of MODE_ALIASES) {
    if (entry.re.test(raw)) {
      return entry.mode;
    }
  }
  return '';
}

function uniqueItems(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const n = normalizeItemName(raw);
    if (!n || seen.has(n)) {
      continue;
    }
    seen.add(n);
    out.push(n);
  }
  return out;
}

function collectEnemySignals(payload) {
  const items = [];
  for (const snap of payload.enemy_items || []) {
    for (const it of snap.items || []) {
      items.push(it);
    }
  }
  const normalized = uniqueItems(items);
  const s = new Set(normalized);
  return {
    hasInvis:
      (payload.enemies || []).some((h) => /riki|bounty|clinkz|nyx|templar|weaver/i.test(h)) ||
      s.has('item_shadow_blade') ||
      s.has('item_silver_edge') ||
      s.has('item_glimmer_cape'),
    hasHealing:
      (payload.enemies || []).some((h) => /huskar|alchemist|necrophos|io|warlock|oracle/i.test(h)) ||
      s.has('item_holy_locket') ||
      s.has('item_mechanism') ||
      s.has('item_guardian_greaves'),
    hasSilence:
      s.has('item_orchid') || s.has('item_bloodthorn') || s.has('item_silence'),
    hasStuns:
      s.has('item_sheepstick') || s.has('item_abyssal_blade') || s.has('item_basher')
  };
}

function stageBias(stage) {
  if (stage === 'starting') return 0;
  if (stage === 'early') return 1;
  if (stage === 'mid') return 2;
  return 3;
}

function scoreItem(item, { mode, stage, signals, pos, isSupport }) {
  let score = 0;

  const prefer = MODE_PREFER[mode] || [];
  const idx = prefer.indexOf(item);
  if (idx >= 0) {
    score += 60 - idx; // strong but not absolute
  }

  // Lightweight situational boosts.
  if (signals.hasHealing && item === 'item_spirit_vessel') {
    score += 30;
  }
  if (signals.hasInvis && (item === 'item_dust' || item === 'item_gem')) {
    score += isSupport ? 25 : 5;
  }
  if ((signals.hasSilence || signals.hasStuns) && item === 'item_black_king_bar') {
    score += 25;
  }

  // Position heuristics: supports want utility, cores want scaling.
  if (isSupport) {
    if (['item_force_staff', 'item_glimmer_cape', 'item_solar_crest', 'item_pipe'].includes(item)) {
      score += 10;
    }
    if (item === 'item_hand_of_midas' || item === 'item_battlefury') {
      score -= 25;
    }
  } else {
    if (item === 'item_smoke_of_deceit' || item === 'item_ward_observer') {
      score -= 20;
    }
  }

  // Stage gating: discourage very late items too early.
  const bias = stageBias(stage);
  if (bias <= 1 && (item === 'item_refresher' || item === 'item_octarine_core')) {
    score -= 20;
  }

  // Small preference for boots early.
  if ((stage === 'starting' || stage === 'early') && /boots/.test(item)) {
    score += 8;
  }

  // Mild bonus for higher positions being greedier.
  if (!isSupport && (pos === 1 || pos === 2) && mode === 'greed') {
    score += 5;
  }

  return score;
}

function pickStage(stage, candidates, ctx) {
  const limit = stage === 'starting' ? 6 : 6;
  const pool = uniqueItems(candidates).filter((it) => !ctx.owned.has(it) && !ctx.chosen.has(it));

  // Group pruning: keep best rank per group.
  const bestRank = {};
  for (const it of pool) {
    const g = GROUP_RANK[it];
    if (!g) continue;
    bestRank[g.group] = Math.max(bestRank[g.group] || 0, g.rank);
  }

  const pruned = pool.filter((it) => {
    const g = GROUP_RANK[it];
    if (!g) return true;
    const r = bestRank[g.group] || g.rank;
    return g.rank >= r;
  });

  const scored = pruned
    .map((it) => ({
      item: it,
      score: scoreItem(it, { ...ctx, stage })
    }))
    .sort((a, b) => b.score - a.score);

  const out = [];
  for (const entry of scored) {
    out.push(entry.item);
    ctx.chosen.add(entry.item);
    if (out.length >= limit) break;
  }
  return out;
}

function buildNotes(mode, signals) {
  const parts = [];
  if (mode) parts.push(`mode=${mode}`);
  if (signals.hasHealing) parts.push('antiheal=vessel');
  if (signals.hasInvis) parts.push('vision=dust/gem');
  if (signals.hasSilence || signals.hasStuns) parts.push('disable=bkb');
  return parts.join(', ') || 'stat rerank';
}

function runPicker(payload, context, { mode = '' } = {}) {
  const pos = Number(payload.pos) || 1;
  const isSupport = pos === 4 || pos === 5;
  const signals = collectEnemySignals(payload);

  const baseline = context?.baseline || {};
  const backendFinal = context?.final || {};

  const normalizedMode = mode || '';
  const ctx = {
    mode: normalizedMode,
    signals,
    pos,
    isSupport,
    owned: new Set(uniqueItems(payload.current_items || [])),
    chosen: new Set()
  };

  const final = {};
  for (const stage of STAGES) {
    const candidates = [
      ...(backendFinal[stage] || []),
      ...(baseline[stage] || []),
      ...((MODE_PREFER[normalizedMode] || []).slice(0, 10))
    ];
    final[stage] = pickStage(stage, candidates, ctx);
  }

  return {
    final,
    notes: buildNotes(normalizedMode, signals),
    mode: normalizedMode,
    source: 'stat_picker_v1'
  };
}

module.exports = {
  extractMode,
  runPicker
};

