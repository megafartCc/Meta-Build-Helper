const ITEM_ALIASES = {
  bkb: 'item_black_king_bar',
  item_bkb: 'item_black_king_bar',
  bfury: 'item_battlefury',
  item_bfury: 'item_battlefury',
  item_battle_fury: 'item_battlefury',
  battle_fury: 'item_battlefury',
  mkb: 'item_monkey_king_bar',
  item_mkb: 'item_monkey_king_bar',
  bots: 'item_boots_of_travel',
  item_bots: 'item_boots_of_travel'
};

function normalizeItemName(raw) {
  let value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[`"'[\]]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  if (!value) {
    return '';
  }

  if (ITEM_ALIASES[value]) {
    value = ITEM_ALIASES[value];
  }

  if (!value.startsWith('item_')) {
    value = `item_${value}`;
  }

  if (ITEM_ALIASES[value]) {
    value = ITEM_ALIASES[value];
  }

  return value;
}

module.exports = {
  normalizeItemName
};

