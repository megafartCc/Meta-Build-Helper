const { extractMode, runPicker } = require('./picker');
const { explainItem } = require('./item-knowledge');
const { normalizeItemName } = require('./util-items');

function detectWhyItem(question) {
  const q = String(question || '').trim();
  if (!q) {
    return '';
  }
  const isWhy = /(^|\s)(why|почему|зачем|for what|what for)(\s|$)/i.test(q);
  if (!isWhy) {
    return '';
  }
  const m = q.match(/item_[a-z0-9_]+/i);
  if (m && m[0]) {
    return normalizeItemName(m[0]);
  }
  return '';
}

function detectNextItem(question) {
  const q = String(question || '').trim();
  if (!q) {
    return false;
  }
  return /(^|\s)(next|что дальше|след(ующий|ом)|что брать дальше)(\s|$)/i.test(q);
}

function buildWhy(payload, picked) {
  const parts = [];
  if (picked?.mode) {
    parts.push(`mode=${picked.mode}`);
  }
  if (payload?.pos) {
    parts.push(`pos=${payload.pos}`);
  }
  if (payload?.facet) {
    parts.push(`facet=${payload.facet}`);
  }
  if (picked?.notes) {
    parts.push(picked.notes);
  }
  return parts.join(', ').slice(0, 180);
}

function formatAsk(final, why) {
  const join = (arr) => (Array.isArray(arr) ? arr.join(', ') : '');
  return [
    `START: ${join(final.starting)}`,
    `EARLY: ${join(final.early)}`,
    `MID: ${join(final.mid)}`,
    `LATE: ${join(final.late)}`,
    `WHY: ${String(why || '').trim()}`
  ].join('\n');
}

function answerCoachAsk({ payload, context }, question) {
  const whyItem = detectWhyItem(question);
  if (whyItem) {
    const reason = explainItem(whyItem);
    const why = reason ? `${whyItem}: ${reason}` : `${whyItem}: situational value`;
    return {
      answer: `WHY: ${why}`.slice(0, 650),
      provider: 'stat_picker',
      model: 'stat_coach_v1'
    };
  }

  const mode = extractMode(question) || '';
  const picked = runPicker(payload, context, { mode });
  const why = buildWhy(payload, picked);

  if (detectNextItem(question)) {
    const owned = new Set((payload.current_items || []).map((x) => normalizeItemName(x)));
    const order = [
      ...picked.final.starting,
      ...picked.final.early,
      ...picked.final.mid,
      ...picked.final.late
    ].filter(Boolean);
    const next = order.find((it) => it && !owned.has(it)) || '';
    const reason = next ? explainItem(next) : '';
    const answer = next
      ? `NEXT: ${next}\nWHY: ${reason || why}`
      : `NEXT: (none)\nWHY: ${why}`;
    return {
      answer: answer.slice(0, 650),
      provider: 'stat_picker',
      model: 'stat_coach_v1'
    };
  }

  return {
    answer: formatAsk(picked.final, why),
    provider: 'stat_picker',
    model: 'stat_coach_v1'
  };
}

module.exports = {
  answerCoachAsk
};
