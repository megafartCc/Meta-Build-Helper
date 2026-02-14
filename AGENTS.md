# AGENTS.md

## Purpose
Guidance for coding agents working in this repo.

## Standards
- Runtime: Node.js 18+.
- Keep code CommonJS unless explicitly migrating.
- Prefer small, composable modules in `src/`.
- Validate all external input with Zod.
- Never hardcode secrets. Use environment variables only.

## Backend Rules
- Keep endpoint contracts stable:
  - `GET /health`
  - `GET /meta`
  - `POST /recommend`
  - `POST /cron/refresh`
  - `POST /cron/patch`
- Rule engine behavior must stay data-driven from `rules` table.
- Baseline meta comes from OpenDota + cached Postgres tables.

## Database
- SQL migrations live in `db/migrations`.
- Apply via `npm run migrate`.
- Avoid manual schema edits outside migrations.

## Commands
- Install: `npm install`
- Migrate: `npm run migrate`
- Run: `npm start`

## Change Process
- Keep edits focused and minimal.
- Update README when endpoint or env behavior changes.
- If adding endpoints, include request/response examples.