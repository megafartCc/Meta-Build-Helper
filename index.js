const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
const db = require('./src/db');
const { ensureCoreSchema } = require('./src/bootstrap');
const { getHeroMeta, refreshHotHeroes } = require('./src/meta-cache');
const { getHeroName } = require('./src/heroes');
const { applyRules } = require('./src/rules');
const { getPatchState, refreshPatchState } = require('./src/patches');
const { makeRequestId, runCoachAsk, runCoachBuild } = require('./src/ai-coach');
const { extractMode, runPicker } = require('./src/picker');
const {
  recommendSchema,
  coachAskSchema,
  coachBuildSchema,
  pickerSchema,
  metaQuerySchema,
  validate
} = require('./src/validation');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: config.requestsPerMinute,
    standardHeaders: true,
    legacyHeaders: false
  })
);

function requireCronAuth(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return next();
  }
  const provided = req.headers['x-cron-secret'];
  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

async function buildRecommendationContext(payload) {
  const baselineMeta = await getHeroMeta(payload.hero_id, 6);
  const heroName = await getHeroName(payload.hero_id);

  const baseline = {
    starting: baselineMeta.starting,
    early: baselineMeta.early,
    mid: baselineMeta.mid,
    late: baselineMeta.late
  };

  const { final, adjustments } = await applyRules(baseline, payload);
  const patch = await getPatchState();

  return {
    hero: {
      id: payload.hero_id,
      name: heroName
    },
    patch: {
      id: patch?.current_patch_id || 'unknown',
      updated_at: patch?.updated_at ? new Date(patch.updated_at).toISOString() : null
    },
    baseline,
    final,
    adjustments,
    meta_updated_at: new Date(baselineMeta.updatedAt).toISOString()
  };
}

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

app.get('/meta', validate(metaQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { hero_id: heroId, max } = req.validated;
    const meta = await getHeroMeta(heroId, max);
    const heroName = await getHeroName(heroId);
    return res.json({
      source: meta.source,
      hero_id: heroId,
      hero_name: heroName,
      updated_at: meta.updatedAt,
      starting: meta.starting,
      early: meta.early,
      mid: meta.mid,
      late: meta.late
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/recommend', validate(recommendSchema), async (req, res, next) => {
  try {
    const payload = req.validated;
    const context = await buildRecommendationContext(payload);
    return res.json(context);
  } catch (error) {
    return next(error);
  }
});

app.post('/coach/ask', validate(coachAskSchema), async (req, res, next) => {
  try {
    const payload = req.validated;
    const requestId = makeRequestId(payload.request_id);
    const context = await buildRecommendationContext(payload);
    const coach = await runCoachAsk(
      {
        request_id: requestId,
        request: payload,
        context
      },
      payload.question
    );

    return res.json({
      request_id: requestId,
      assistant: {
        provider: 'groq',
        model: coach.model,
        answer: coach.answer
      },
      context,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/coach/build', validate(coachBuildSchema), async (req, res, next) => {
  try {
    const payload = req.validated;
    const requestId = makeRequestId(payload.request_id);
    const context = await buildRecommendationContext(payload);
    const mode = extractMode(payload.style_request);

    // If request is a simple "mode build" (magic/tank/etc), prefer stat picker to avoid upstream LLM limits.
    let coach;
    if (mode) {
      coach = runPicker(payload, context, { mode });
      coach.model = 'stat_picker_v1';
      coach.provider = 'stat_picker';
    } else {
      coach = await runCoachBuild(
        {
          request_id: requestId,
          request: payload,
          context
        },
        payload.style_request
      );
      coach.provider = 'groq';
    }

    return res.json({
      request_id: requestId,
      style_request: payload.style_request,
      baseline: context.final,
      final: coach.final,
      notes: coach.notes,
      assistant: {
        provider: coach.provider || 'groq',
        model: coach.model
      },
      context_meta: {
        hero: context.hero,
        patch: context.patch,
        meta_updated_at: context.meta_updated_at
      },
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/picker', validate(pickerSchema), async (req, res, next) => {
  try {
    const payload = req.validated;
    const requestId = makeRequestId(payload.request_id);
    const context = await buildRecommendationContext(payload);
    const mode = extractMode(payload.mode);
    const picked = runPicker(payload, context, { mode });

    return res.json({
      request_id: requestId,
      mode: picked.mode,
      baseline: context.final,
      final: picked.final,
      notes: picked.notes,
      assistant: {
        provider: 'stat_picker',
        model: 'stat_picker_v1'
      },
      context_meta: {
        hero: context.hero,
        patch: context.patch,
        meta_updated_at: context.meta_updated_at
      },
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/cron/refresh', requireCronAuth, async (_req, res, next) => {
  try {
    const refreshed = await refreshHotHeroes(6);
    return res.json({ ok: true, refreshed_count: refreshed.length, refreshed });
  } catch (error) {
    return next(error);
  }
});

app.post('/cron/patch', requireCronAuth, async (_req, res, next) => {
  try {
    const state = await refreshPatchState();
    return res.json({ ok: true, ...state });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const code = status >= 500 ? 'InternalServerError' : 'RequestError';
  const fallbackMessage = status >= 500 ? 'Internal server error' : 'Request failed';
  const retryAfterSeconds = Number.isFinite(error?.retryAfterSeconds)
    ? Math.max(1, Math.min(600, Math.floor(error.retryAfterSeconds)))
    : null;

  if (retryAfterSeconds && status === 429) {
    res.set('Retry-After', String(retryAfterSeconds));
  }

  res.status(status).json({
    error: code,
    message: error?.message || fallbackMessage,
    ...(retryAfterSeconds ? { retry_after_s: retryAfterSeconds } : {})
  });
});

async function start() {
  await ensureCoreSchema();

  app.listen(config.port, () => {
    console.log(`meta-build-helper listening on :${config.port}`);
  });
}

start().catch((error) => {
  console.error('Startup failed:', error);
  process.exit(1);
});
