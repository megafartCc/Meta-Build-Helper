const { normalizeItemName } = require('./util-items');

const ITEM_PURPOSE = {
  item_black_king_bar: 'spell immunity vs disables/silence/burst',
  item_manta: 'dispel + split push + dodge projectiles',
  item_lotus_orb: 'dispel + reflect single-target disables',
  item_spirit_vessel: 'anti-heal vs regen/HP sustain',
  item_orchid: 'silence to catch slippery heroes',
  item_bloodthorn: 'silence + true strike for evasion',
  item_diffusal_blade: 'mana burn + slow to kite/lock targets',
  item_pipe: 'team magic barrier vs heavy magic damage',
  item_crimson_guard: 'team phys block vs summons/fast hitters',
  item_assault: 'armor aura + attack speed (siege/physical)',
  item_shivas_guard: 'armor + anti-heal aura + vision/slow',
  item_heavens_halberd: 'disarm vs right-click cores',
  item_nullifier: 'removes defensive buffs (ghost, glimmer, force)',
  item_blink: 'mobility/initiation/positioning',
  item_force_staff: 'save/reposition vs slows/root',
  item_glimmer_cape: 'save vs magic burst + invis',
  item_solar_crest: 'buff ally / debuff enemy armor',
  item_linkens_sphere: 'block single-target spells',
  item_aeon_disk: 'anti-burst safety',
  item_monkey_king_bar: 'true strike vs evasion',
  item_sheepstick: 'hard disable to start fights / catch',
  item_ultimate_scepter: 'hero-specific power spike',
  item_octarine_core: 'cooldowns + sustain for spell-heavy builds'
};

function explainItem(rawName) {
  const name = normalizeItemName(rawName);
  if (!name) {
    return '';
  }
  return ITEM_PURPOSE[name] || '';
}

module.exports = {
  explainItem
};

