const { extractMode, runPicker } = require('./picker');

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
  const mode = extractMode(question) || '';
  const picked = runPicker(payload, context, { mode });
  const why = buildWhy(payload, picked);
  return {
    answer: formatAsk(picked.final, why),
    provider: 'stat_picker',
    model: 'stat_coach_v1'
  };
}

module.exports = {
  answerCoachAsk
};

