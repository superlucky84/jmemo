# E2E Integration Tests

## Scope
- Runner: Playwright (`@playwright/test`)
- Target: running backend API (`API_BASE_URL`, default `http://127.0.0.1:4000`)
- Scenarios: create/update/delete, tag OR search + pagination, upload flow, health checks

## Run
1. Run E2E tests:

```bash
pnpm run test:e2e
```

The Playwright config starts backend automatically with memory data mode:
- `PORT=4100`
- `JMEMO_USE_MEMORY_SERVICE=1`
- `API_BASE_URL=http://127.0.0.1:4100`

## Notes
- These tests use API-level integration to validate Phase 7 contracts without browser UI flakiness.
- For browser UI E2E expansion, add page-driven specs under `tests/e2e/ui-*.spec.ts`.
