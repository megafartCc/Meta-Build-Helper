# Meta-Build-Helper

Production-ready Node.js backend for a Dota 2 meta build helper.

## Stack
- Node.js 18+
- Express
- PostgreSQL (`pg`)
- Zod validation
- Rate limiting (`express-rate-limit`)

## Features
- `GET /health`
- `GET /meta?hero_id=94&max=6`
- `POST /recommend`
- `POST /cron/refresh`
- `POST /cron/patch`
- OpenDota cache with TTL:
  - item constants: 24h default
  - hero meta: 45m default (`2700s`)
- Data-driven rule engine from Postgres `rules` table

## Environment Variables
Copy `.env.example` and set values:

- `DATABASE_URL` (recommended)
- or Postgres parts: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `PORT` (default: `3000`)
- `ITEM_CONSTANTS_TTL_SECONDS` (default: `86400`)
- `HERO_META_TTL_SECONDS` (default: `2700`)
- `REQUESTS_PER_MINUTE` (default: `120`)
- `HOT_HEROES` (default: `1,94,114`)
- `CRON_SECRET` (optional; if set, send in `x-cron-secret` for cron endpoints)

## Local Run
```bash
npm install
npm run migrate
npm start
```

## Railway Deploy
1. Push this repo to GitHub.
2. In Railway, create a new project from the repo.
3. Add a Postgres service.
4. Set environment variables (`DATABASE_URL`, optional overrides).
5. Deploy with start command: `npm start`.
6. Run migrations once (Railway shell or predeploy): `npm run migrate`.

## API Examples

Health:
```bash
curl http://localhost:3000/health
```

Meta:
```bash
curl "http://localhost:3000/meta?hero_id=94&max=6"
```
Response includes `hero_id`, `hero_name`, and stage arrays: `starting`, `early`, `mid`, `late`.

Recommend:
```bash
curl -X POST http://localhost:3000/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "hero_id": 94,
    "pos": 1,
    "facet": "",
    "time_s": 1200,
    "current_items": ["item_power_treads"],
    "allies": ["Invoker"],
    "enemies": ["Phantom Assassin", "Lion"]
  }'
```

Refresh cache:
```bash
curl -X POST http://localhost:3000/cron/refresh
```

Refresh patch state:
```bash
curl -X POST http://localhost:3000/cron/patch
```

## Notes
- Do not commit secrets or API keys.
- If any key was exposed previously, rotate it immediately.
- Rules can be edited in Postgres without code changes.
