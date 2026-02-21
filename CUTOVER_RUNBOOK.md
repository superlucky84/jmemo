# Cutover Runbook

This runbook is for the final Atlas cutover (Phase 8).

## 1. Preconditions
- Latest archive is prepared from `../jwmemo` (for example: `./mongo-all.archive`).
- `.env` has valid `MONGODB_URI` and production `UPLOAD_DIR`.
- Atlas IP Access List includes:
  - `221.150.15.64/32` (local operator)
  - `159.223.120.99/32` (production server)

## 2. Dry Run
```bash
pnpm run cutover:run -- --archive ./mongo-all.archive --dry-run --uri 'mongodb+srv://...'
```

Expected:
- `RESULT=DRY_RUN`
- no destructive actions executed.

## 3. Real Cutover
```bash
pnpm run cutover:run -- --archive ./mongo-all.archive --yes
```

Pipeline order:
1. `migrate:reset` (drop + full restore)
2. collection count check (`release:counts`)
3. release smoke (`release:smoke`)

## 4. Post-Cutover Verification
- Run health checks:
```bash
pnpm run release:smoke -- --skip-write
```
- Run full smoke:
```bash
pnpm run release:smoke
```
- Confirm major collection counts:
```bash
pnpm run release:counts -- --collections jmemos,categories
```

## 5. Failure Handling
- If any step fails, fix the cause and rerun:
```bash
pnpm run cutover:run -- --archive ./mongo-all.archive --yes
```
- Strategy is re-run from full reset, not incremental rollback.
