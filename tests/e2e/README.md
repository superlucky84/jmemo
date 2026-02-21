# E2E Integration Tests

## Scope
- Runner: Playwright (`@playwright/test`)
- Target: running backend API (`API_BASE_URL`, default `http://127.0.0.1:4000`)
- Scenarios: create/update/delete, tag OR search + pagination, upload flow, health checks

## Run
1. Start backend server (`pnpm run server:start` or `pnpm run server:dev`)
2. Run E2E tests:

```bash
pnpm run test:e2e
```

## Notes
- These tests use API-level integration to validate Phase 7 contracts without browser UI flakiness.
- For browser UI E2E expansion, add page-driven specs under `tests/e2e/ui-*.spec.ts`.
