# jmemo

Refactoring workspace for `jwmemo` with a document-first workflow.

## Core Docs
- Requirements: `REQUIREMENTS.md`
- Design: `DESIGN.md`
- Implementation plan: `IMPLEMENT.md`
- Release manual checklist: `MANUAL_TEST_CHECKLIST.md`

## Local Setup
1. Install dependencies: `pnpm install`
2. Copy env template: `cp .env.example .env`
3. Fill `MONGODB_URI` in `.env`
4. Validate env: `pnpm run env:check`
5. Ping Atlas: `pnpm run db:ping`

## Development Commands
- Frontend dev server: `pnpm run dev`
- Backend dev server: `pnpm run server:dev`
- Backend start: `pnpm run server:start`
- Unit tests: `pnpm run test:unit`
- Smoke tests: `pnpm run test:smoke`
- All tests: `pnpm run test`
- Migration dry-run: `pnpm run migrate:reset -- --archive ./mongo-all.archive --dry-run`

`migrate:reset` restore runner order:
1. `docker` (if installed)
2. `MONGORESTORE_BIN` (if set)
3. `./node_modules/.bin/mongorestore`
4. `mongorestore` from system PATH

If you do not want Docker, install database tools locally/system-wide:
`brew install mongodb-database-tools`

## Backend API (current)
- `GET /health/live`
- `GET /health/ready`
- `POST /jnote/create`
- `GET /jnote/read`
- `GET /jnote/read/:id`
- `POST /jnote/update`
- `POST /jnote/delete`
- `POST /jnote/upload`
