const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
const db = require('./src/db');
const { ensureCoreSchema } = require('./src/bootstrap');
const { getHeroMeta, refreshHotHeroes } = require('./src/meta-cache');
const { applyRules } = require('./src/rules');
const { getPatchState, refreshPatchState } = require('./src/patches');
const { recommendSchema, metaQuerySchema, validate } = require('./src/validation');

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
    return res.json({
      source: meta.source,
      hero_id: heroId,
      updated_at: meta.updatedAt,
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
    const baselineMeta = await getHeroMeta(payload.hero_id, 6);

    const baseline = {
      early: baselineMeta.early,
      mid: baselineMeta.mid,
      late: baselineMeta.late
    };

    const { final, adjustments } = await applyRules(baseline, payload);
    const patch = await getPatchState();

    return res.json({
      patch: {
        id: patch?.current_patch_id || 'unknown',
        updated_at: patch?.updated_at ? new Date(patch.updated_at).toISOString() : null
      },
      baseline,
      final,
      adjustments,
      meta_updated_at: new Date(baselineMeta.updatedAt).toISOString()
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
  res.status(500).json({ error: 'InternalServerError', message: error.message });
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
