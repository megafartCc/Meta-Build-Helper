const crypto = require('crypto');
const config = require('./config');

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

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

function makeRequestId(requestId) {
  const candidate = String(requestId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, '_')
    .slice(0, 120);
  if (candidate.length >= 8) {
    return candidate;
  }
  return crypto.randomUUID();
}

function ensureAiEnabled() {
  if (!config.coachAiApiKey) {
    throw new HttpError(503, 'Coach AI is not configured: set COACH_AI_API_KEY or GROQ_API_KEY');
  }
}

function extractText(decoded) {
  if (decoded?.choices?.[0]?.message?.content) {
    return String(decoded.choices[0].message.content);
  }
  if (decoded?.output?.[0]?.content?.[0]?.text) {
    return String(decoded.output[0].content[0].text);
  }
  return '';
}

function extractFirstJsonObject(text) {
  if (!text) {
    return '';
  }
  const start = text.indexOf('{');
  if (start < 0) {
    return '';
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return '';
}

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

function sanitizeStage(list, maxItems = 8) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const normalized = normalizeItemName(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= maxItems) {
      break;
    }
  }
  return out;
}

function normalizeStages(payload) {
  const source = payload?.final || payload || {};
  return {
    starting: sanitizeStage(source.starting || []),
    early: sanitizeStage(source.early || []),
    mid: sanitizeStage(source.mid || []),
    late: sanitizeStage(source.late || [])
  };
}

async function callCoachModel(messages, { temperature, maxTokens, forceJson = false } = {}) {
  ensureAiEnabled();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.coachAiTimeoutMs);

  const body = {
    model: config.coachAiModel,
    messages,
    temperature: temperature ?? 0.25,
    max_tokens: maxTokens ?? config.coachAiMaxTokens,
    stream: false
  };
  if (forceJson) {
    body.response_format = { type: 'json_object' };
  }

  let response;
  try {
    response = await fetch(config.coachAiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.coachAiApiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HttpError(504, 'Coach AI request timed out');
    }
    throw new HttpError(502, `Coach AI request failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let decoded = {};
  try {
    decoded = text ? JSON.parse(text) : {};
  } catch (_error) {
    // Keep raw body for diagnostics below.
  }

  if (!response.ok) {
    const apiMessage = decoded?.error?.message || text || `HTTP ${response.status}`;
    throw new HttpError(response.status, `Coach AI upstream error: ${apiMessage}`);
  }

  return decoded;
}

function buildAskMessages(statContext, question) {
  const contextJson = JSON.stringify(statContext);
  return [
    {
      role: 'system',
      content:
        'You are a 15k MMR Dota 2 coach. Prioritize statistical evidence from backend/OpenDota context and give practical, concise advice.'
    },
    {
      role: 'system',
      content:
        'When discussing itemization, reference baseline/final and matchup signals from context. If context is sufficient, avoid generic filler.'
    },
    {
      role: 'system',
      content: `Match context JSON: ${contextJson}`
    },
    {
      role: 'user',
      content: String(question || '')
    }
  ];
}

function buildStyleMessages(statContext, styleRequest) {
  const contextJson = JSON.stringify(statContext);
  return [
    {
      role: 'system',
      content:
        'You are a 15k MMR Dota 2 build transformer. Use OpenDota-backed baseline and matchup context to produce a coherent style-specific build.'
    },
    {
      role: 'user',
      content:
        'Return ONLY JSON: {"final":{"starting":[],"early":[],"mid":[],"late":[]},"notes":"short reason"}. ' +
        'Use only item_ names. Keep build valid for hero/role/timing/matchup. ' +
        `Style request: ${String(styleRequest || '')}. Context JSON: ${contextJson}`
    }
  ];
}

async function runCoachAsk(statContext, question) {
  const messages = buildAskMessages(statContext, question);
  const decoded = await callCoachModel(messages, {
    temperature: 0.35,
    maxTokens: config.coachAiMaxTokens,
    forceJson: false
  });
  const answer = extractText(decoded).trim();
  return {
    answer: answer || 'No answer returned by coach model.',
    model: decoded?.model || config.coachAiModel
  };
}

async function runCoachBuild(statContext, styleRequest) {
  const messages = buildStyleMessages(statContext, styleRequest);
  const decoded = await callCoachModel(messages, {
    temperature: 0.2,
    maxTokens: Math.max(config.coachAiMaxTokens, 700),
    forceJson: true
  });

  let parsed;
  const text = extractText(decoded);
  if (text) {
    const jsonBlob = extractFirstJsonObject(text);
    if (jsonBlob) {
      parsed = JSON.parse(jsonBlob);
    }
  }
  if (!parsed && decoded?.final) {
    parsed = decoded;
  }
  if (!parsed) {
    throw new HttpError(502, 'Coach build did not return valid JSON');
  }

  const final = normalizeStages(parsed);
  const notes = String(parsed.notes || '').trim();

  return {
    final,
    notes: notes || 'Style build generated from backend/OpenDota context.',
    model: decoded?.model || config.coachAiModel
  };
}

module.exports = {
  HttpError,
  makeRequestId,
  runCoachAsk,
  runCoachBuild
};

