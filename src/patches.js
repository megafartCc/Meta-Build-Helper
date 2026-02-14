const db = require('./db');

const PATCH_URL = 'https://www.dota2.com/patches';

function parsePatchState(html) {
  const normalized = html.replace(/\s+/g, ' ');
  const patchMatch = normalized.match(/Patch\s+([0-9]+\.[0-9]+[a-z]?)/i);
  const altPatchMatch = normalized.match(/\b([0-9]+\.[0-9]+[a-z]?)\b/i);
  const publishedMatch = normalized.match(/datetime="([^"]+)"/i);

  const currentPatchId = patchMatch?.[1] || altPatchMatch?.[1] || 'unknown';
  const publishedAt = publishedMatch?.[1] || null;
  const rawText = normalized.slice(0, 4000);

  return { currentPatchId, publishedAt, rawText };
}

async function fetchPatchStateFromWeb() {
  const response = await fetch(PATCH_URL, { headers: { accept: 'text/html' } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Patch fetch failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const html = await response.text();
  return parsePatchState(html);
}

async function getPatchState() {
  const { rows } = await db.query(
    `SELECT current_patch_id, updated_at, published_at
     FROM patch_state
     WHERE id = 1`
  );
  return rows[0] || null;
}

async function upsertPatchState(state) {
  const { rows } = await db.query(
    `INSERT INTO patch_state (id, current_patch_id, updated_at, published_at, raw_text)
     VALUES (1, $1, NOW(), $2, $3)
     ON CONFLICT (id)
     DO UPDATE SET current_patch_id = EXCLUDED.current_patch_id,
                   updated_at = NOW(),
                   published_at = EXCLUDED.published_at,
                   raw_text = EXCLUDED.raw_text
     RETURNING current_patch_id, updated_at, published_at`,
    [state.currentPatchId, state.publishedAt, state.rawText]
  );
  return rows[0];
}

async function refreshPatchState() {
  const current = await getPatchState();
  const next = await fetchPatchStateFromWeb();
  const hasChanged = !current || current.current_patch_id !== next.currentPatchId;
  const saved = await upsertPatchState(next);
  return {
    changed: hasChanged,
    current_patch_id: saved.current_patch_id,
    updated_at: saved.updated_at,
    published_at: saved.published_at
  };
}

module.exports = {
  getPatchState,
  refreshPatchState
};