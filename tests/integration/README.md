# Integration tests

These tests hit a real Postgres database. They are NOT run by the default
`pnpm test` command.

## Run

```bash
# Make sure Postgres is up (Phase 1's Docker Compose):
docker compose --env-file .env.local up -d postgres

# Run all integration tests:
pnpm test:integration

# Run a single file:
pnpm test:integration tests/integration/reviews.integration.test.ts
```

## Conventions

Each integration test file:

1. Lives in `tests/integration/` and is named `<feature>.integration.test.ts`.
2. Uses the per-file namespace helper:
   ```ts
   import { testNamespace, cleanupByPrefix } from '../helpers/db'
   const NS = testNamespace('<feature>')
   ```
3. Prefixes every row it inserts with `NS` on a stable string column (e.g.,
   `key`, `hashtag`, `product_id`). For tables without a natural string
   column at the row level, insert a marker prefix on the most identifying
   text column.
4. Cleans up in `afterAll` via `cleanupByPrefix(table, columnName, NS)`.

This pattern lets parallel test files coexist safely. Cross-file rows are
invisible to each other because each file gets a unique 8-hex-char suffix.

## Why a separate command?

`pnpm test` is the fast unit-test loop and must not require Docker. The
integration command exists so a developer can opt in to the slower, more
realistic checks when the DB layer is the focus.
