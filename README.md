# jmemo

Refactoring workspace for `jwmemo` with a document-first workflow.

## Core Docs
- Requirements: `REQUIREMENTS.md`
- Design: `DESIGN.md`
- Implementation plan: `IMPLEMENT.md`
- Release manual checklist: `MANUAL_TEST_CHECKLIST.md`
- Cutover runbook: `CUTOVER_RUNBOOK.md`

## Environment Setup
1. Install dependencies: `pnpm install`
2. Create env file: `cp .env.example .env`
3. Fill required values in `.env`:
   - `MONGODB_URI`
   - `AUTH_PASSWORD` (recommended for write protection)
4. Validate env: `pnpm run env:check`
5. Check Atlas connectivity: `pnpm run db:ping`

Optional local memory mode (no Atlas):
- `JMEMO_USE_MEMORY_SERVICE=1`

## Development Server (Local Work)
Run frontend and backend in separate terminals.

Terminal A (backend):
```bash
pnpm run server:dev
```

Terminal B (frontend):
```bash
pnpm run dev
```

Then open:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

Notes:
- Vite dev server proxies `/auth`, `/jnote`, `/health`, `/images` to backend.
- `pnpm run dev` alone is not enough. Backend must also run.

## Production Server (Single Process + Built Frontend)
Backend can serve API and built frontend together.

1. Install deps:
```bash
pnpm install --frozen-lockfile
```

2. Build frontend:
```bash
pnpm run build
```

3. Start backend:
```bash
pnpm run server:start
```

4. Verify:
```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
```

When `dist/` exists, `http://localhost:4000/` serves the web app (`index.html`).

## Useful Commands
- Unit tests: `pnpm run test:unit`
- Smoke tests: `pnpm run test:smoke`
- Integration tests: `pnpm run test:integration`
- All tests: `pnpm run test`
- JUnit report: `pnpm run test:report`
- E2E integration (Playwright API): `pnpm run test:e2e`
- API+DB smoke script: `pnpm run integration:smoke`
- Release smoke script: `pnpm run release:smoke`
- Cutover collection counts: `pnpm run release:counts`
- Cutover pipeline: `pnpm run cutover:run -- --archive ./mongo-all.archive --yes`
- Migration dry-run: `pnpm run migrate:reset -- --archive ./mongo-all.archive --dry-run`

`pnpm run test:e2e` starts backend automatically in memory mode
(`JMEMO_USE_MEMORY_SERVICE=1`, `PORT=4100`) so Atlas is not required.

`migrate:reset` restore runner order:
1. `docker` (if installed)
2. `MONGORESTORE_BIN` (if set)
3. `./node_modules/.bin/mongorestore`
4. `mongorestore` from system PATH

If Docker is not available, install tools locally:
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
