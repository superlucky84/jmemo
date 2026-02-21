# Repository Guidelines

## Project Structure & Module Organization
This repository is currently a clean slate. Add code using a predictable layout:
- `src/` for application or library code, grouped by feature.
- `tests/` mirroring `src/` paths.
- `assets/` for static files.
- `scripts/` for local automation tasks.
- `docs/` for architecture notes and ADRs.
Keep modules small and focused, and expose shared logic through clear public interfaces.

## Build, Test, and Development Commands
No build system is configured yet. When bootstrapping, expose standard workflows through one entry point (prefer a `Makefile` or package scripts):
- `make setup`: install dependencies and tooling.
- `make dev`: run the local development workflow.
- `make test`: execute the full test suite.
- `make lint`: run linting and format checks.
- `make build`: produce release artifacts.
If you introduce tool-specific commands (`pnpm`, `pytest`, etc.), map them to these targets for consistency.

## Coding Style & Naming Conventions
Use the formatter/linter for each language and commit only formatted code.
- Indentation: 2 spaces for JS/TS/JSON/YAML, 4 spaces for Python.
- Naming: `kebab-case` for scripts/assets, `snake_case` for Python modules, `PascalCase` for React-style components.
- Prefer descriptive filenames (for example, `auth_session.ts` over `utils2.ts`).
Add comments only where intent is not obvious from code.

## Testing Guidelines
Place tests in `tests/` and mirror source structure.
- JS/TS tests: `*.test.ts` or `*.spec.ts`.
- Python tests: `test_*.py`.
Cover happy paths, failure paths, and edge cases for new behavior. Keep tests deterministic and fast, and require passing tests before merging.

## Commit & Pull Request Guidelines
No Git history is available yet, so use Conventional Commits going forward:
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
PRs should include a concise summary, linked issue (`Closes #123` when applicable), test evidence (commands run), and screenshots for UI changes. Keep each PR focused on one logical change.

## Security & Configuration Tips
Never commit credentials or tokens. Store required settings in `.env.example`, keep real values in local `.env`, and ensure secret files are ignored by Git.
