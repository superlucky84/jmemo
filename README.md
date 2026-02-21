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

If you need to run backend without Atlas (local integration tests), set:
- `JMEMO_USE_MEMORY_SERVICE=1`

## Development Commands
- Frontend dev server: `pnpm run dev`
- Backend dev server: `pnpm run server:dev`
- Backend start: `pnpm run server:start`
- Unit tests: `pnpm run test:unit`
- Smoke tests: `pnpm run test:smoke`
- Integration tests: `pnpm run test:integration`
- All tests: `pnpm run test`
- JUnit report: `pnpm run test:report`
- E2E integration (Playwright API): `pnpm run test:e2e`
- API+DB smoke script: `pnpm run integration:smoke`
- Release smoke script: `pnpm run release:smoke`
- Cutover collection counts: `pnpm run release:counts`
- Cutover pipeline (migrate -> counts -> smoke): `pnpm run cutover:run -- --archive ./mongo-all.archive --yes`
- Migration dry-run: `pnpm run migrate:reset -- --archive ./mongo-all.archive --dry-run`

`pnpm run test:e2e` starts backend automatically in memory mode
(`JMEMO_USE_MEMORY_SERVICE=1`, `PORT=4100`) so it does not require Atlas access.

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
