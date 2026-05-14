# Phase 2: Database Schemas & Test Infra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every remaining Postgres table needed by the rest of v1, with migrations applied, integration tests passing under a clean unit/integration split, and the carry-forward housekeeping items from Phase 1 cleaned up. Phase 2 is purely backend: no UI, no external API, no new Docker services. By the end, the DB schema is "done" and Phase 3 (Square) can write to `product_cache` and `order_log` without further schema work.

**Architecture:** Drizzle ORM schema-per-table, one migration generated per table for clean rollback granularity, integration tests namespaced by per-test-file prefix to coexist safely. `pnpm test` runs unit-only (no Docker required); `pnpm test:integration` runs the full set against the local Postgres container. `server-only` import locks down `env.ts` so the env loader cannot accidentally bleed into a client bundle in later phases.

**Tech Stack:** Same as Phase 1 — Drizzle ORM 0.36, drizzle-kit 0.28, postgres-js 3.4, Vitest 2.1, Postgres 16. No new dependencies except possibly `uuid` for review IDs (Postgres native `gen_random_uuid()` is preferred; we'll use that and skip the JS dep).

**Outcome at end of Phase 2:**
- 8 new tables in Postgres: `event_logos`, `sms_recipients`, `wishlists`, `reviews`, `abandoned_carts`, `customer_link`, `product_cache`, `order_log`.
- 8 new Drizzle migration files, each applied successfully via `pnpm db:push`.
- 8 new integration tests (one per table) plus the carry-over `db.integration.test.ts` migrated to the new structure, all passing.
- `env.ts` import-guarded with `server-only`.
- `tests/env.test.ts` uses `vi.stubEnv`; biome-ignore comments removed.
- `biome.json` has a test overrides block.
- `pnpm test` is fast and Docker-free; `pnpm test:integration` runs the full integration set.
- Git tag `phase-2-schemas` marks the milestone.

**API keys needed:** None. Phase 2 is fully offline-capable; only Postgres needs to be up (from Phase 1's Docker Compose).

---

## File structure after Phase 2

```
animeniacs-shop/
├── biome.json                              ← MODIFIED: tests overrides block
├── .env.example                            ← MODIFIED: blank cookie placeholder + comment
├── package.json                            ← MODIFIED: test:integration script
├── vitest.config.ts                        ← MODIFIED: split into projects (unit/integration)
├── vitest.integration.config.ts            ← NEW: integration-only vitest entry
│
├── drizzle/migrations/
│   ├── 0000_early_richard_fisk.sql         ← existing (site_settings)
│   ├── 0001_<name>_event_logos.sql         ← NEW
│   ├── 0002_<name>_sms_recipients.sql      ← NEW
│   ├── 0003_<name>_wishlists.sql           ← NEW
│   ├── 0004_<name>_reviews.sql             ← NEW
│   ├── 0005_<name>_abandoned_carts.sql     ← NEW
│   ├── 0006_<name>_customer_link.sql       ← NEW
│   ├── 0007_<name>_product_cache.sql       ← NEW
│   └── 0008_<name>_order_log.sql           ← NEW
│
├── scripts/
│   └── content-build.ts                    ← MODIFIED: typeof guard on data.title
│
├── src/
│   ├── lib/
│   │   ├── env.ts                          ← MODIFIED: import 'server-only'
│   │   └── db/
│   │       ├── client.ts                   ← unchanged
│   │       └── schema.ts                   ← MODIFIED: append 8 new pgTable defs
│   │
│   └── components/layout/
│       └── NewsletterSignupStub.tsx        ← unchanged
│
├── tests/
│   ├── env.test.ts                         ← MODIFIED: vi.stubEnv pattern
│   ├── newsletter-signup-stub.test.tsx     ← NEW: placeholder test for Phase 9
│   ├── helpers/
│   │   └── db.ts                           ← NEW: testNamespace() + cleanupByPrefix()
│   └── integration/
│       ├── README.md                       ← NEW: explains the convention
│       ├── site-settings.integration.test.ts   ← MIGRATED from tests/db.integration.test.ts
│       ├── event-logos.integration.test.ts     ← NEW
│       ├── sms-recipients.integration.test.ts  ← NEW
│       ├── wishlists.integration.test.ts       ← NEW
│       ├── reviews.integration.test.ts         ← NEW
│       ├── abandoned-carts.integration.test.ts ← NEW
│       ├── customer-link.integration.test.ts   ← NEW
│       ├── product-cache.integration.test.ts   ← NEW
│       └── order-log.integration.test.ts       ← NEW
│
└── (tests/db.integration.test.ts)          ← DELETED after migration to integration/
```

---

## Conventions (read first)

### Drizzle schema conventions

- One `pgTable` per table, exported from `src/lib/db/schema.ts`. Phase 2 appends — does not restructure.
- Column names: `snake_case` SQL ↔ `camelCase` TS via Drizzle's column name string argument: `addedAt: timestamp('added_at', ...)`.
- `text` for variable-length strings (Postgres has no varchar penalty). `text` for emails and slugs.
- `timestamp(... , { withTimezone: true })` everywhere. Never naive timestamps.
- `defaultNow()` on `created_at` / `updated_at` columns.
- Inferred types exported alongside each table: `export type Foo = typeof fooTable.$inferSelect; export type NewFoo = typeof fooTable.$inferInsert`.

### Integration test conventions

Each integration test file:
1. Lives in `tests/integration/` and is named `<feature>.integration.test.ts`.
2. Imports the shared helper: `import { testNamespace, cleanupByPrefix } from '../helpers/db'`.
3. Generates a unique namespace string in the test file scope: `const NS = testNamespace('reviews')`. Format: `<feature>__<random_8_hex>`.
4. Every row this test file inserts uses `NS` as a prefix on a stable string column (e.g., `key`, `hashtag`, `phone`, `product_id`). For tables without a natural string PK, use a dedicated `tag` or marker column — but we won't add columns just for tests. Instead, use a constant field like `key` for site_settings, `hashtag` for event_logos, or insert a marker prefix on `product_id` strings (Square IDs are opaque, so a `TEST_<ns>_` prefix works).
5. In `afterAll`, call `cleanupByPrefix(table, columnName, NS)` to delete only the rows this test file created.
6. Mark each test `await`-safe: never assume cleanup runs between tests in the same file. Tests inside one file can write to the same NS; cross-file tests can't see each other's data because each file gets its own NS.

### Unit vs integration split

- **Unit tests** (`tests/**/*.test.ts(x)` excluding `tests/integration/**`): no DB connection, mocked external services, fast. Run by default via `pnpm test`.
- **Integration tests** (`tests/integration/**/*.integration.test.ts`): require Postgres reachable at `DATABASE_URL`. Run via `pnpm test:integration`. Pre-condition documented in `tests/integration/README.md`: "Run `docker compose --env-file .env.local up -d postgres` first."
- CI (when added in a later phase) will run both with Postgres started by a job step.
- The `pnpm test` script no longer hangs/fails when Docker is down. This is the primary motivation for the split.

### Migrations

- One migration per table, generated immediately after the schema edit. Subagent never edits an existing migration; each task always runs `pnpm db:generate` which produces a new numbered file.
- Migration filenames are `0001_<name>.sql` etc.; Drizzle Kit auto-generates the `<name>` (a random adjective_noun string). Reference filenames in this plan use placeholders like `0001_<name>_event_logos.sql` — the actual name will vary.
- After every migration, run `pnpm db:push` to apply. The integration test for that table will fail if push didn't work.

---

## Task 1: Add `server-only` guard to env.ts

`env.ts` is imported by every server-side module (DB client, API routes, server components). If a future client component accidentally imports a server module that pulls in `env.ts`, webpack will silently substitute non-`NEXT_PUBLIC_*` env vars with `undefined`, and zod will throw at module-load time **in the browser**. Adding `import 'server-only'` causes that mistake to fail loudly at build time instead. The vitest `server-only` alias from Phase 1 already neutralizes the import for tests.

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1.1: Add the server-only import**

Edit `src/lib/env.ts`. Insert `import 'server-only'` as the very first line. The resulting file head:

```typescript
import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // ...rest unchanged
})
```

- [ ] **Step 1.2: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: exits 0 with no output.

- [ ] **Step 1.3: Run full unit test suite to confirm vitest stub still works**

Run:
```bash
pnpm test
```

Expected: all unit tests pass. The vitest config from Phase 1 aliases `server-only` to `src/test/server-only-stub.ts`, so the import is silently neutralized in tests.

- [ ] **Step 1.4: Verify the build still works**

Run:
```bash
pnpm build
```

Expected: builds successfully. The `server-only` import resolves to a real Next.js module at build time; the next compiler enforces it only when imported from a client bundle.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/env.ts
git commit -m "Task 1: Phase 2 — guard env.ts with 'server-only'

env.ts throws if any non-NEXT_PUBLIC_* var is undefined. Webpack
substitutes only NEXT_PUBLIC_* in client bundles, so an accidental
client-side import would crash at runtime. Locking it server-side
makes the mistake fail at build time instead.

Vitest alias from Phase 1 already neutralizes the import for tests."
```

---

## Task 2: Blank the LOGTO_COOKIE_SECRET placeholder in .env.example

The current `.env.example` value `replace_with_openssl_rand_base64_48` is 39 chars and passes zod's `.min(32)`. A dev who copies the file unchanged boots with that string as their cookie secret. Make the value empty and add a generation-command comment so the field is obviously incomplete.

**Files:**
- Modify: `.env.example`

- [ ] **Step 2.1: Edit .env.example**

Change the Logto block from:

```bash
# Logto (filled in Phase 7)
LOGTO_ENDPOINT=http://localhost:3001
LOGTO_APP_ID=
LOGTO_APP_SECRET=
LOGTO_COOKIE_SECRET=replace_with_openssl_rand_base64_48
```

To:

```bash
# Logto (filled in Phase 7)
LOGTO_ENDPOINT=http://localhost:3001
LOGTO_APP_ID=
LOGTO_APP_SECRET=
# Generate with: openssl rand -base64 48 | tr -d '\n'
LOGTO_COOKIE_SECRET=
```

- [ ] **Step 2.2: Verify zod schema still allows empty (optional)**

`env.ts` declares `LOGTO_COOKIE_SECRET: z.string().min(32).optional()`. An empty value parses as `undefined` only if the env var is *missing*; if it's defined-but-empty, zod sees a 0-length string and fails `.min(32)`. The `.env.local` already has a real value, so the live stack stays healthy.

The fix here is documentation-only — `.env.example` is for new devs who'll edit it. No code change needed.

- [ ] **Step 2.3: Commit**

```bash
git add .env.example
git commit -m "Task 2: Phase 2 — blank LOGTO_COOKIE_SECRET placeholder

Previous placeholder passed zod's .min(32) check, letting a dev
boot with a known non-secret value. Empty value + generation
command comment makes the gap obvious."
```

---

## Task 3: Modernize tests/env.test.ts with vi.stubEnv

Vitest's `vi.stubEnv` / `vi.unstubAllEnvs` is the idiomatic way to mutate `process.env` in tests. It eliminates the two `biome-ignore lint/performance/noDelete` comments and the `originalEnv = process.env` reference-not-snapshot bug.

**Files:**
- Modify: `tests/env.test.ts`

- [ ] **Step 3.1: Rewrite the test file**

Replace the entire contents of `tests/env.test.ts` with:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('env loader', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses a valid DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db')
    const mod = await import('../src/lib/env')
    expect(mod.env.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db')
  })

  it('defaults NEXT_PUBLIC_SITE_URL to localhost', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const mod = await import('../src/lib/env')
    expect(mod.env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
  })

  it('throws on missing DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '')
    await expect(import('../src/lib/env')).rejects.toThrow('Invalid environment configuration')
  })
})
```

Note: `vi.stubEnv('FOO', '')` sets the env var to an empty string. Zod treats empty strings differently from `undefined`: an empty string fails `.string().url()` and `.min(1)` checks, which is what we want for the "missing" and "default-applies" cases. This is functionally equivalent to the previous `delete` semantics for these specific assertions.

- [ ] **Step 3.2: Run the env tests**

Run:
```bash
pnpm test tests/env.test.ts
```

Expected: 3 passed, no biome warnings, no `delete` references.

- [ ] **Step 3.3: Run lint to confirm no biome-ignore comments needed**

Run:
```bash
pnpm lint
```

Expected: 0 errors. (The previous `biome-ignore lint/performance/noDelete` comments are no longer needed.)

- [ ] **Step 3.4: Commit**

```bash
git add tests/env.test.ts
git commit -m "Task 3: Phase 2 — env tests use vi.stubEnv

Vitest's stubEnv/unstubAllEnvs is the idiomatic replacement for
process.env mutation. Eliminates two biome-ignore comments and
the originalEnv-as-reference-not-snapshot footgun."
```

---

## Task 4: biome.json overrides for test files

Phase 2 adds 9+ integration tests, and Phase 7+ will add many React Testing Library tests. Both legitimately need `noExplicitAny` (mock typing) and `noNonNullAssertion` (`screen.getByRole(...)!.parentElement` patterns). Scope these rules off for test files via an overrides block, so production code keeps the strict checks.

**Files:**
- Modify: `biome.json`

- [ ] **Step 4.1: Add overrides block to biome.json**

Edit `biome.json`. After the top-level `linter` block, before the closing brace, add a `overrides` array. The full updated `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "ignore": [".next", "node_modules", "drizzle/migrations", "public"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "warn",
        "useImportType": "error"
      },
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  },
  "overrides": [
    {
      "include": ["tests/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
      "linter": {
        "rules": {
          "style": {
            "noNonNullAssertion": "off"
          },
          "suspicious": {
            "noExplicitAny": "off"
          }
        }
      }
    }
  ],
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "none",
      "semicolons": "asNeeded",
      "arrowParentheses": "always"
    }
  }
}
```

- [ ] **Step 4.2: Run lint to confirm production code is still strict**

Run:
```bash
pnpm lint
```

Expected: 0 errors. Production code's strict checks are unaffected.

- [ ] **Step 4.3: Sanity-check the override applies**

Create a temporary file `tests/_override-check.test.ts` (we'll delete it after):

```typescript
import { describe, it, expect } from 'vitest'

describe('override smoke', () => {
  it('allows non-null assertion in test files', () => {
    const x: { y?: string } = { y: 'hello' }
    // biome-ignore-start: this should NOT be needed; verify by removing if biome still flags
    expect(x.y!).toBe('hello')
  })
})
```

Run:
```bash
pnpm lint tests/_override-check.test.ts
```

Expected: 0 errors. The `!` non-null assertion compiles without a biome warning.

Now delete the file:
```bash
rm tests/_override-check.test.ts
```

- [ ] **Step 4.4: Commit**

```bash
git add biome.json
git commit -m "Task 4: Phase 2 — biome overrides for test files

tests/** and src/**/*.test.* now allow:
  - noNonNullAssertion (RTL patterns like getByRole(...)!.parent)
  - noExplicitAny (mock typing)

Production code keeps the strict rules. Replaces scattered
biome-ignore comments with a single declarative override."
```

---

## Task 5: scripts/content-build.ts — typeof guard on data.title

The cast `(data.title as string) ?? titleMatch?.[1] ?? slug` is unsafe: if frontmatter has `title: 42` or `title: { en: "Foo" }`, the cast lies and TS doesn't help. One-line fix using `typeof`.

**Files:**
- Modify: `scripts/content-build.ts`

- [ ] **Step 5.1: Edit the title resolution**

In `scripts/content-build.ts`, find the line:

```typescript
const title = (data.title as string) ?? titleMatch?.[1] ?? slug.replace(/-/g, ' ')
```

Replace with:

```typescript
const frontmatterTitle = typeof data.title === 'string' ? data.title : undefined
const title = frontmatterTitle ?? titleMatch?.[1] ?? slug.replace(/-/g, ' ')
```

- [ ] **Step 5.2: Rebuild the content manifest to confirm**

Run:
```bash
pnpm content:build
```

Expected: `Built 12 content pages → src/lib/generated/content-manifest.json`. No errors.

- [ ] **Step 5.3: Run content tests**

Run:
```bash
pnpm test tests/content.test.ts
```

Expected: 4 passed (unchanged behavior; the guard only affects edge cases not in our current content).

- [ ] **Step 5.4: Commit**

```bash
git add scripts/content-build.ts
git commit -m "Task 5: Phase 2 — content-build title type-guard

Replace unsafe \`as string\` cast with typeof check. Future frontmatter
with a non-string \`title\` will fall through to the H1 regex match
or the slug-derived default, instead of silently casting to a wrong
type."
```

---

## Task 6: drizzle.config.ts comment refresh

Phase 1 noted the `DEFAULT_LOCAL_DB_URL` fallback is "genuinely useful for `pnpm db:generate` without a live env." Phase 2 keeps the fallback but expands the comment so future readers understand the trade-off without re-deriving it.

**Files:**
- Modify: `drizzle.config.ts`

- [ ] **Step 6.1: Edit the comment block**

Replace lines 1-7 of `drizzle.config.ts` (the existing comment and constant) with:

```typescript
import type { Config } from 'drizzle-kit'

// Drizzle Kit runs as a standalone CLI — it does NOT go through the Next.js
// bundler, so it can't import `@/lib/env` (which is server-only-guarded and
// expects a live process.env).
//
// We keep a local-dev fallback URL so two ergonomics work out of the box:
//   1. `pnpm db:generate` without a sourced .env.local (CI-friendly, fast path).
//   2. New devs running `pnpm db:push` for the first time with default credentials.
//
// Trade-off: a misconfigured production deploy with no DATABASE_URL would
// silently target the local-dev URL. Acceptable because production runs
// `pnpm db:migrate` inside a container where the env is always explicitly set,
// and the resulting connection would fail loudly on the wrong host.
const DEFAULT_LOCAL_DB_URL = 'postgres://animeniacs:animeniacs@localhost:5432/animeniacs'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Use `||` (not `??`) so an explicitly-empty DATABASE_URL falls back to the default.
    url: process.env.DATABASE_URL || DEFAULT_LOCAL_DB_URL
  },
  verbose: true,
  strict: true
} satisfies Config
```

- [ ] **Step 6.2: Sanity-check by running db:generate (no schema change yet, should be a no-op)**

Run:
```bash
pnpm db:generate
```

Expected: `No schema changes, nothing to migrate 😴` (or equivalent Drizzle Kit "nothing to do" output). No new migration file.

- [ ] **Step 6.3: Commit**

```bash
git add drizzle.config.ts
git commit -m "Task 6: Phase 2 — drizzle.config.ts comment refresh

Documents the trade-off of keeping a local-dev fallback URL:
  - ergonomic for pnpm db:generate without a sourced .env
  - production miss would silently target localhost (but always fails
    loudly at connection time on a non-local host)"
```

---

## Task 7: Split unit vs integration tests; add db test helpers

Two motivations:
1. `pnpm test` should not require Docker. Today, `tests/db.integration.test.ts` hangs if Postgres is down.
2. Phase 2 adds 8 more integration tests. They need a shared cleanup convention before the count grows.

**Files:**
- Modify: `package.json` (add `test:integration` script)
- Modify: `vitest.config.ts` (exclude integration directory from default run)
- Create: `vitest.integration.config.ts`
- Create: `tests/integration/README.md`
- Create: `tests/helpers/db.ts`
- Move: `tests/db.integration.test.ts` → `tests/integration/site-settings.integration.test.ts` (and refactor to use the helper)

- [ ] **Step 7.1: Create tests/helpers/db.ts**

```typescript
import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'

/**
 * Returns a per-test-file namespace string used to prefix DB rows.
 * Lets parallel integration test files coexist without trampling each other.
 *
 * Usage:
 *   const NS = testNamespace('reviews')
 *   // → "reviews__a1b2c3d4"
 *
 * Insert rows with NS-prefixed string columns:
 *   await db.insert(reviews).values({ productId: `${NS}_prod_1`, ... })
 *
 * Clean up in afterAll:
 *   await cleanupByPrefix(reviews, 'product_id', NS)
 */
export function testNamespace(feature: string): string {
  const suffix = randomBytes(4).toString('hex')
  return `${feature}__${suffix}`
}

/**
 * Deletes every row in `table` where the given column starts with `prefix`.
 * Use in afterAll to scope cleanup to the rows this test file created.
 *
 * `columnName` is the SQL column name (snake_case), not the Drizzle property name.
 */
export async function cleanupByPrefix(
  table: PgTable,
  columnName: string,
  prefix: string
): Promise<void> {
  // Drizzle's `sql` template handles identifier quoting and value binding safely.
  await db.execute(
    sql`DELETE FROM ${table} WHERE ${sql.identifier(columnName)} LIKE ${`${prefix}%`}`
  )
}
```

- [ ] **Step 7.2: Move tests/db.integration.test.ts → tests/integration/site-settings.integration.test.ts**

Create directory:
```bash
mkdir -p tests/integration
```

Delete the old file and create the new one at `tests/integration/site-settings.integration.test.ts`:

```typescript
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { siteSettings } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('site-settings')

describe('site_settings integration', () => {
  it('can write and read a row', async () => {
    const key = `${NS}_key_a`
    await db.insert(siteSettings).values({ key, value: { hello: 'world' } })
    const rows = await db.select().from(siteSettings)
    const row = rows.find((r) => r.key === key)
    expect(row?.value).toEqual({ hello: 'world' })
  })

  it('can read multiple rows written under the same namespace', async () => {
    await db.insert(siteSettings).values([
      { key: `${NS}_multi_1`, value: { n: 1 } },
      { key: `${NS}_multi_2`, value: { n: 2 } }
    ])
    const rows = await db.select().from(siteSettings)
    const mine = rows.filter((r) => r.key.startsWith(`${NS}_multi_`))
    expect(mine).toHaveLength(2)
  })

  afterAll(async () => {
    await cleanupByPrefix(siteSettings, 'key', NS)
  })
})
```

Then delete the old file:

```bash
rm tests/db.integration.test.ts
```

- [ ] **Step 7.3: Update vitest.config.ts to exclude integration tests from the default run**

Replace the contents of `vitest.config.ts` with:

```typescript
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Load .env.local so any test that genuinely needs DATABASE_URL Just Works.
// override: false → real environment wins over file; absent file is silently skipped.
loadDotenv({ path: '.env.local', override: false })

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Unit tests only by default. Integration tests run via `pnpm test:integration`.
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['tests/integration/**', 'node_modules/**', '.next/**']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts')
    }
  }
})
```

- [ ] **Step 7.4: Create vitest.integration.config.ts**

```typescript
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vitest/config'

loadDotenv({ path: '.env.local', override: false })

export default defineConfig({
  test: {
    // Integration tests use the Node env (no jsdom); they run real DB queries.
    environment: 'node',
    setupFiles: [],
    globals: true,
    include: ['tests/integration/**/*.integration.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // Integration tests share the same Postgres; force serial to avoid surprises.
    // Each test file uses a unique namespace prefix, so parallelism would be safe
    // in principle — but serial is simpler to debug and the volume is small.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Generous timeout for cold-start connection pool.
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts')
    }
  }
})
```

- [ ] **Step 7.5: Add the test:integration script to package.json**

Edit `package.json`. Add `"test:integration": "vitest run --config vitest.integration.config.ts"` after `"test:watch"`. The scripts block becomes:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "biome check .",
  "lint:fix": "biome check --apply .",
  "format": "biome format --write .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio",
  "content:build": "tsx scripts/content-build.ts",
  "prebuild": "pnpm content:build"
}
```

- [ ] **Step 7.6: Create tests/integration/README.md**

```markdown
# Integration tests

These tests hit a real Postgres database. They are NOT run by the default
`pnpm test` command.

## Run

```bash
# Make sure Postgres is up (Phase 1's Docker Compose):
docker compose --env-file ../../.env.local up -d postgres

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
```

- [ ] **Step 7.7: Run unit tests — confirm they pass without Postgres up**

Stop Postgres first to prove it:

```bash
docker compose stop postgres
pnpm test
```

Expected: all unit tests pass (env, content, header, footer, static-pages, smoke). No hangs.

- [ ] **Step 7.8: Run integration tests — confirm the site_settings test still works**

Start Postgres again:

```bash
docker compose --env-file .env.local up -d postgres
sleep 10
pnpm test:integration
```

Expected: 2 tests in `tests/integration/site-settings.integration.test.ts` pass.

- [ ] **Step 7.9: Run typecheck and lint**

Run:
```bash
pnpm typecheck
pnpm lint
```

Expected: both green.

- [ ] **Step 7.10: Commit**

```bash
git add tests/ vitest.config.ts vitest.integration.config.ts package.json
git rm tests/db.integration.test.ts 2>/dev/null || true
git commit -m "Task 7: Phase 2 — split unit vs integration tests + db helpers

- pnpm test is now Docker-free (excludes tests/integration/**)
- pnpm test:integration runs the full integration set
- tests/helpers/db.ts: testNamespace() + cleanupByPrefix() convention
- tests/integration/site-settings.integration.test.ts migrated from old
  tests/db.integration.test.ts using the new pattern
- tests/integration/README.md documents the convention

Phase 2 will add 8 more integration tests using this scaffold."
```

---

## Task 8: `event_logos` table

Per spec §11 Storage. Hashtag is the PK (no leading `#`, e.g., `anime-expo`). `source` column is constrained to `'scraped' | 'manual_upload' | 'manual_override'`.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/event-logos.integration.test.ts`
- Generate: `drizzle/migrations/0001_*.sql`

- [ ] **Step 8.1: Append event_logos schema to src/lib/db/schema.ts**

Add after the existing `siteSettings` export:

```typescript
export const eventLogos = pgTable('event_logos', {
  hashtag: text('hashtag').primaryKey(), // e.g. "anime-expo" (no leading #)
  imageUrl: text('image_url').notNull(),
  source: text('source', { enum: ['scraped', 'manual_upload', 'manual_override'] }).notNull(),
  sourceEventUrl: text('source_event_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by')
})

export type EventLogo = typeof eventLogos.$inferSelect
export type NewEventLogo = typeof eventLogos.$inferInsert
```

Note: Drizzle's `text(...).enum([...])` generates a `CHECK (source IN (...))` constraint in the migration, matching the spec.

- [ ] **Step 8.2: Generate the migration**

Run:
```bash
pnpm db:generate
```

Expected: creates `drizzle/migrations/0001_<name>.sql` containing `CREATE TABLE "event_logos" (...)`. Verify the file exists:

```bash
ls drizzle/migrations/ | tail -5
```

- [ ] **Step 8.3: Apply the migration**

Run:
```bash
pnpm db:push
```

Expected: `Changes applied`. Verify the table:

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs -c "\d event_logos"
```

Expected: shows columns and the CHECK constraint on `source`.

- [ ] **Step 8.4: Create the integration test**

Create `tests/integration/event-logos.integration.test.ts`:

```typescript
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { eventLogos } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('event-logos')

describe('event_logos integration', () => {
  it('inserts a scraped logo and reads it back', async () => {
    const hashtag = `${NS}_anime_expo`
    await db.insert(eventLogos).values({
      hashtag,
      imageUrl: 'https://example.test/anime-expo.png',
      source: 'scraped',
      sourceEventUrl: 'https://www.anime-expo.org'
    })
    const rows = await db.select().from(eventLogos)
    const row = rows.find((r) => r.hashtag === hashtag)
    expect(row).toMatchObject({
      hashtag,
      imageUrl: 'https://example.test/anime-expo.png',
      source: 'scraped',
      sourceEventUrl: 'https://www.anime-expo.org'
    })
    expect(row?.updatedAt).toBeInstanceOf(Date)
  })

  it('rejects an invalid source value', async () => {
    const hashtag = `${NS}_invalid`
    // Cast through `as never` to bypass TS — we're testing the Postgres CHECK constraint.
    await expect(
      db.insert(eventLogos).values({
        hashtag,
        imageUrl: 'https://example.test/x.png',
        source: 'not_a_valid_source' as never
      })
    ).rejects.toThrow()
  })

  it('overrides update updatedAt', async () => {
    const hashtag = `${NS}_override`
    await db.insert(eventLogos).values({
      hashtag,
      imageUrl: 'https://example.test/v1.png',
      source: 'scraped'
    })

    // Wait long enough for timestamp to differ at millisecond resolution.
    await new Promise((resolve) => setTimeout(resolve, 50))

    await db
      .update(eventLogos)
      .set({
        imageUrl: 'https://example.test/v2.png',
        source: 'manual_override',
        updatedAt: new Date()
      })
      .where(/* drizzle eq() */ (await import('drizzle-orm')).eq(eventLogos.hashtag, hashtag))

    const [row] = await db
      .select()
      .from(eventLogos)
      .where((await import('drizzle-orm')).eq(eventLogos.hashtag, hashtag))
    expect(row?.source).toBe('manual_override')
    expect(row?.imageUrl).toBe('https://example.test/v2.png')
  })

  afterAll(async () => {
    await cleanupByPrefix(eventLogos, 'hashtag', NS)
  })
})
```

- [ ] **Step 8.5: Run the test**

Run:
```bash
pnpm test:integration tests/integration/event-logos.integration.test.ts
```

Expected: 3 passed.

- [ ] **Step 8.6: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 8.7: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/event-logos.integration.test.ts
git commit -m "Task 8: Phase 2 — event_logos table

Per spec §11 Storage. Hashtag PK (no leading #). Source column
constrained via Postgres CHECK to scraped/manual_upload/manual_override.
Integration test covers insert, constraint violation, and update."
```

---

## Task 9: `sms_recipients` table

Per spec §11 Storage. Auto-incrementing ID, unique E.164 phone, optional label, enabled toggle.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/sms-recipients.integration.test.ts`
- Generate: `drizzle/migrations/0002_*.sql`

- [ ] **Step 9.1: Append sms_recipients schema to src/lib/db/schema.ts**

First add the `serial` and `boolean` imports if not already present. Update the top import line:

```typescript
import { boolean, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
```

Then append:

```typescript
export const smsRecipients = pgTable('sms_recipients', {
  id: serial('id').primaryKey(),
  phone: text('phone').notNull().unique(), // E.164 format
  label: text('label'), // "Owner", "Manager", etc.
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export type SmsRecipient = typeof smsRecipients.$inferSelect
export type NewSmsRecipient = typeof smsRecipients.$inferInsert
```

- [ ] **Step 9.2: Generate and apply the migration**

Run:
```bash
pnpm db:generate
pnpm db:push
```

Expected: new migration file `0002_*.sql` created and applied. Verify:

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs -c "\d sms_recipients"
```

- [ ] **Step 9.3: Create the integration test**

The `phone` column is numeric and unique, which makes it a poor cleanup key (numeric prefixes collide across runs). We tag rows via `label` instead, which is plain text — every row this test file creates carries `label = '<NS>_...'`, and cleanup deletes by label prefix.

Create `tests/integration/sms-recipients.integration.test.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { smsRecipients } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('sms')

// Phones must be unique numeric strings. We allocate a private +1 555-01 range
// (E.164 fictional reserved space) plus a counter that resets per test file.
let counter = 0
function nextPhone(): string {
  counter += 1
  return `+1555${String(Date.now()).slice(-7)}${String(counter).padStart(2, '0')}`
}

describe('sms_recipients integration', () => {
  it('inserts a recipient with defaults', async () => {
    const phone = nextPhone()
    const [row] = await db
      .insert(smsRecipients)
      .values({ phone, label: `${NS}_owner` })
      .returning()
    expect(row.phone).toBe(phone)
    expect(row.label).toBe(`${NS}_owner`)
    expect(row.enabled).toBe(true) // default
    expect(row.id).toBeGreaterThan(0)
  })

  it('enforces unique phone constraint', async () => {
    const phone = nextPhone()
    await db.insert(smsRecipients).values({ phone, label: `${NS}_dup_a` })
    await expect(
      db.insert(smsRecipients).values({ phone, label: `${NS}_dup_b` })
    ).rejects.toThrow()
  })

  it('can disable a recipient', async () => {
    const phone = nextPhone()
    const [row] = await db
      .insert(smsRecipients)
      .values({ phone, label: `${NS}_disable_target` })
      .returning()
    await db.update(smsRecipients).set({ enabled: false }).where(eq(smsRecipients.id, row.id))
    const [updated] = await db
      .select()
      .from(smsRecipients)
      .where(eq(smsRecipients.id, row.id))
    expect(updated.enabled).toBe(false)
  })

  afterAll(async () => {
    // All test rows carry an NS-prefixed label; cleanup by label is safe.
    await cleanupByPrefix(smsRecipients, 'label', NS)
  })
})
```

Note: `cleanupByPrefix` uses a `LIKE 'NS%'` filter. Rows without a label (e.g., real production data in a shared DB) won't match because NULL doesn't match LIKE, so this is also safe in a shared environment.

- [ ] **Step 9.4: Run the test**

Run:
```bash
pnpm test:integration tests/integration/sms-recipients.integration.test.ts
```

Expected: 3 passed.

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/sms-recipients.integration.test.ts
git commit -m "Task 9: Phase 2 — sms_recipients table

Per spec §11 Storage. Serial PK, unique E.164 phone, optional label,
enabled toggle defaulting true. Integration test covers defaults,
unique-violation, and the disable workflow."
```

---

## Task 10: `wishlists` table

Per spec §6.2. Composite PK on `(user_id, product_id)` because one user can wishlist many products but each (user, product) pair is at most once. `user_id` is the Logto user ID (text). `product_id` is the Square catalog item ID (text).

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/wishlists.integration.test.ts`
- Generate: `drizzle/migrations/0003_*.sql`

- [ ] **Step 10.1: Append wishlists schema**

Add `primaryKey` to the imports:

```typescript
import { boolean, jsonb, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core'
```

Then append:

```typescript
export const wishlists = pgTable(
  'wishlists',
  {
    userId: text('user_id').notNull(), // Logto user ID
    productId: text('product_id').notNull(), // Square catalog item ID
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.productId] })
  })
)

export type WishlistEntry = typeof wishlists.$inferSelect
export type NewWishlistEntry = typeof wishlists.$inferInsert
```

- [ ] **Step 10.2: Generate and apply the migration**

Run:
```bash
pnpm db:generate
pnpm db:push
```

- [ ] **Step 10.3: Create the integration test**

Create `tests/integration/wishlists.integration.test.ts`:

```typescript
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { wishlists } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('wishlists')

describe('wishlists integration', () => {
  it('adds a product to a user wishlist', async () => {
    const userId = `${NS}_user_a`
    const productId = `${NS}_prod_1`
    await db.insert(wishlists).values({ userId, productId })

    const [row] = await db
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)))
    expect(row.userId).toBe(userId)
    expect(row.addedAt).toBeInstanceOf(Date)
  })

  it('allows multiple products per user', async () => {
    const userId = `${NS}_user_b`
    await db.insert(wishlists).values([
      { userId, productId: `${NS}_prod_b1` },
      { userId, productId: `${NS}_prod_b2` },
      { userId, productId: `${NS}_prod_b3` }
    ])
    const rows = await db.select().from(wishlists).where(eq(wishlists.userId, userId))
    expect(rows).toHaveLength(3)
  })

  it('enforces the (user_id, product_id) composite primary key', async () => {
    const userId = `${NS}_user_c`
    const productId = `${NS}_prod_c1`
    await db.insert(wishlists).values({ userId, productId })
    await expect(db.insert(wishlists).values({ userId, productId })).rejects.toThrow()
  })

  afterAll(async () => {
    await cleanupByPrefix(wishlists, 'user_id', NS)
  })
})
```

- [ ] **Step 10.4: Run the test**

Run:
```bash
pnpm test:integration tests/integration/wishlists.integration.test.ts
```

Expected: 3 passed.

- [ ] **Step 10.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/wishlists.integration.test.ts
git commit -m "Task 10: Phase 2 — wishlists table

Per spec §6.2. Composite PK on (user_id, product_id). User IDs come
from Logto, product IDs from Square Catalog. Integration test covers
add, multi-product per user, and PK uniqueness."
```

---

## Task 11: `reviews` table

Per spec §7 Data model. UUID PK via Postgres `gen_random_uuid()`, rating CHECK constraint 1-5, photo_urls as text[] (bounded ≤ 5 enforced at write time, not in DB), `is_published` default false, unique constraint on `(user_id, product_id)`.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/reviews.integration.test.ts`
- Generate: `drizzle/migrations/0004_*.sql`

- [ ] **Step 11.1: Append reviews schema**

Add the imports for `uuid`, `integer`, and `check`:

```typescript
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
```

Then append:

```typescript
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: text('product_id').notNull(), // Square catalog item ID
    userId: text('user_id'), // Logto user ID; nullable for legacy/imported reviews
    orderId: text('order_id'), // Square order ID; used to verify purchase
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    photoUrls: text('photo_urls').array().notNull().default(sql`'{}'::text[]`),
    isPublished: boolean('is_published').notNull().default(false),
    isVerifiedPurchase: boolean('is_verified_purchase').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ratingRange: check('reviews_rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
    uniqueUserProduct: unique('reviews_user_product_unique').on(table.userId, table.productId)
  })
)

export type Review = typeof reviews.$inferSelect
export type NewReview = typeof reviews.$inferInsert
```

Notes:
- `uuid().defaultRandom()` uses Postgres `gen_random_uuid()` (built-in to Postgres 13+; no `uuid-ossp` extension needed).
- `text('photo_urls').array()` produces `text[]`. The `default(sql\`'{}'::text[]\`)` syntax gives an empty array default.
- The unique constraint on `(user_id, product_id)` enforces "one review per user per product" from the spec. Note: when `user_id` is NULL (legacy review), Postgres treats NULL as distinct, so multiple legacy reviews can exist for the same product. That's intentional.
- The 5-photo cap is application-level, not schema-level — easier to evolve.

- [ ] **Step 11.2: Generate and apply the migration**

Run:
```bash
pnpm db:generate
pnpm db:push
```

Verify the table and constraints:

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs -c "\d reviews"
```

Expected: shows the CHECK constraint and unique constraint.

- [ ] **Step 11.3: Create the integration test**

Create `tests/integration/reviews.integration.test.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { reviews } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('reviews')

describe('reviews integration', () => {
  it('inserts a 5-star review with photos and reads it back', async () => {
    const productId = `${NS}_prod_1`
    const userId = `${NS}_user_1`
    const [row] = await db
      .insert(reviews)
      .values({
        productId,
        userId,
        orderId: `${NS}_order_1`,
        rating: 5,
        title: 'Amazing',
        body: 'Love this print.',
        photoUrls: [
          `${NS}_photo_a.jpg`,
          `${NS}_photo_b.jpg`
        ],
        isVerifiedPurchase: true
      })
      .returning()
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(row.rating).toBe(5)
    expect(row.photoUrls).toEqual([`${NS}_photo_a.jpg`, `${NS}_photo_b.jpg`])
    expect(row.isPublished).toBe(false) // default
    expect(row.isVerifiedPurchase).toBe(true)
  })

  it('rejects a rating of 0', async () => {
    await expect(
      db.insert(reviews).values({
        productId: `${NS}_prod_x`,
        userId: `${NS}_user_x`,
        rating: 0,
        body: 'invalid'
      })
    ).rejects.toThrow()
  })

  it('rejects a rating of 6', async () => {
    await expect(
      db.insert(reviews).values({
        productId: `${NS}_prod_y`,
        userId: `${NS}_user_y`,
        rating: 6,
        body: 'invalid'
      })
    ).rejects.toThrow()
  })

  it('enforces one review per (user, product)', async () => {
    const productId = `${NS}_prod_uniq`
    const userId = `${NS}_user_uniq`
    await db.insert(reviews).values({ productId, userId, rating: 4, body: 'first' })
    await expect(
      db.insert(reviews).values({ productId, userId, rating: 5, body: 'second' })
    ).rejects.toThrow()
  })

  it('allows multiple anonymous (null user_id) reviews on one product', async () => {
    const productId = `${NS}_prod_anon`
    await db.insert(reviews).values({ productId, userId: null, rating: 3, body: 'a' })
    await db.insert(reviews).values({ productId, userId: null, rating: 4, body: 'b' })
    const rows = await db.select().from(reviews).where(eq(reviews.productId, productId))
    expect(rows).toHaveLength(2)
  })

  it('defaults photoUrls to an empty array', async () => {
    const productId = `${NS}_prod_no_photos`
    const [row] = await db
      .insert(reviews)
      .values({
        productId,
        userId: `${NS}_user_no_photos`,
        rating: 5,
        body: 'no photos'
      })
      .returning()
    expect(row.photoUrls).toEqual([])
  })

  afterAll(async () => {
    await cleanupByPrefix(reviews, 'product_id', NS)
  })
})
```

- [ ] **Step 11.4: Run the test**

Run:
```bash
pnpm test:integration tests/integration/reviews.integration.test.ts
```

Expected: 6 passed.

- [ ] **Step 11.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/reviews.integration.test.ts
git commit -m "Task 11: Phase 2 — reviews table

Per spec §7. UUID PK via gen_random_uuid(), CHECK rating BETWEEN 1 AND 5,
unique (user_id, product_id), photo_urls as text[] (5-cap enforced
app-side). is_published defaults false (admin moderates).

Integration test covers happy path, rating bounds (0, 6), unique
violation, NULL user_id distinctness, and photo_urls default."
```

---

## Task 12: `abandoned_carts` table

Per spec §9. Stores cart abandonment state for the 30-minute timer + reminder-email feature in Phase 9.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/abandoned-carts.integration.test.ts`
- Generate: `drizzle/migrations/0005_*.sql`

- [ ] **Step 12.1: Append abandoned_carts schema**

The status field is constrained to four values per spec: `pending`, `in_checkout`, `completed`, `abandoned`.

```typescript
export const abandonedCarts = pgTable('abandoned_carts', {
  cartId: text('cart_id').primaryKey(), // UUID we generate at /api/checkout
  squareOrderId: text('square_order_id'), // populated once Square assigns an order ID
  buyerEmail: text('buyer_email'), // nullable; only known if buyer typed it
  cartSnapshot: jsonb('cart_snapshot').notNull(), // line items for the reminder email
  status: text('status', {
    enum: ['pending', 'in_checkout', 'completed', 'abandoned']
  })
    .notNull()
    .default('pending'),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type AbandonedCart = typeof abandonedCarts.$inferSelect
export type NewAbandonedCart = typeof abandonedCarts.$inferInsert
```

- [ ] **Step 12.2: Generate and apply the migration**

```bash
pnpm db:generate
pnpm db:push
```

- [ ] **Step 12.3: Create the integration test**

Create `tests/integration/abandoned-carts.integration.test.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { abandonedCarts } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('abandoned-carts')

describe('abandoned_carts integration', () => {
  it('inserts a pending cart with defaults', async () => {
    const cartId = `${NS}_cart_1`
    const [row] = await db
      .insert(abandonedCarts)
      .values({
        cartId,
        cartSnapshot: { items: [{ id: 'sq_item_1', name: 'Naruto', qty: 1, price: 7500 }] }
      })
      .returning()
    expect(row.cartId).toBe(cartId)
    expect(row.status).toBe('pending') // default
    expect(row.squareOrderId).toBeNull()
    expect(row.reminderSentAt).toBeNull()
    expect(row.cartSnapshot).toEqual({
      items: [{ id: 'sq_item_1', name: 'Naruto', qty: 1, price: 7500 }]
    })
  })

  it('transitions through statuses', async () => {
    const cartId = `${NS}_cart_2`
    await db.insert(abandonedCarts).values({
      cartId,
      cartSnapshot: { items: [] }
    })

    for (const status of ['in_checkout', 'completed'] as const) {
      await db
        .update(abandonedCarts)
        .set({ status, updatedAt: new Date() })
        .where(eq(abandonedCarts.cartId, cartId))
      const [row] = await db
        .select()
        .from(abandonedCarts)
        .where(eq(abandonedCarts.cartId, cartId))
      expect(row.status).toBe(status)
    }
  })

  it('rejects an unknown status', async () => {
    const cartId = `${NS}_cart_3`
    await expect(
      db.insert(abandonedCarts).values({
        cartId,
        cartSnapshot: {},
        status: 'definitely_not_a_status' as never
      })
    ).rejects.toThrow()
  })

  afterAll(async () => {
    await cleanupByPrefix(abandonedCarts, 'cart_id', NS)
  })
})
```

- [ ] **Step 12.4: Run the test**

Run:
```bash
pnpm test:integration tests/integration/abandoned-carts.integration.test.ts
```

Expected: 3 passed.

- [ ] **Step 12.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/abandoned-carts.integration.test.ts
git commit -m "Task 12: Phase 2 — abandoned_carts table

Per spec §9. Status CHECK constrained to pending/in_checkout/completed/
abandoned. cart_snapshot JSONB stores line items for the reminder email
in Phase 9. reminder_sent_at is the throttle field for the timer job.

Integration test covers defaults, status transitions, and constraint."
```

---

## Task 13: `customer_link` table

Per spec §10 My Account flow. Email → Square customer_id mapping, TTL 1 day. Phase 7 reads this cache; Phase 2 just creates the table.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/customer-link.integration.test.ts`
- Generate: `drizzle/migrations/0006_*.sql`

- [ ] **Step 13.1: Append customer_link schema**

```typescript
export const customerLink = pgTable('customer_link', {
  email: text('email').primaryKey(), // normalized lowercase
  squareCustomerId: text('square_customer_id').notNull(),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow()
})

export type CustomerLink = typeof customerLink.$inferSelect
export type NewCustomerLink = typeof customerLink.$inferInsert
```

Note on TTL: we don't enforce TTL at the DB level. Phase 7 reads with `WHERE cached_at > now() - interval '1 day'`; expired rows can be overwritten on next miss.

- [ ] **Step 13.2: Generate and apply the migration**

```bash
pnpm db:generate
pnpm db:push
```

- [ ] **Step 13.3: Create the integration test**

Create `tests/integration/customer-link.integration.test.ts`:

```typescript
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { customerLink } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('customer-link')

describe('customer_link integration', () => {
  it('caches an email→square_customer_id mapping', async () => {
    const email = `${NS}_alice@example.test`
    const squareCustomerId = `${NS}_sq_cust_alice`
    await db.insert(customerLink).values({ email, squareCustomerId })

    const [row] = await db
      .select()
      .from(customerLink)
      .where(eq(customerLink.email, email))
    expect(row.squareCustomerId).toBe(squareCustomerId)
    expect(row.cachedAt).toBeInstanceOf(Date)
  })

  it('overwrites on conflict via upsert pattern', async () => {
    const email = `${NS}_bob@example.test`
    await db.insert(customerLink).values({ email, squareCustomerId: 'old_id' })
    await db
      .insert(customerLink)
      .values({ email, squareCustomerId: 'new_id' })
      .onConflictDoUpdate({
        target: customerLink.email,
        set: { squareCustomerId: 'new_id', cachedAt: new Date() }
      })
    const [row] = await db.select().from(customerLink).where(eq(customerLink.email, email))
    expect(row.squareCustomerId).toBe('new_id')
  })

  it('TTL query filters out expired rows', async () => {
    const email = `${NS}_stale@example.test`
    // Insert with an explicitly old cachedAt.
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 25) // 25 hours ago
    await db
      .insert(customerLink)
      .values({ email, squareCustomerId: 'stale', cachedAt: oldDate })

    // The Phase 7 read pattern: only return non-expired rows.
    const rows = await db
      .select()
      .from(customerLink)
      .where(sql`${customerLink.cachedAt} > now() - interval '1 day'`)
    expect(rows.find((r) => r.email === email)).toBeUndefined()
  })

  afterAll(async () => {
    await cleanupByPrefix(customerLink, 'email', NS)
  })
})
```

- [ ] **Step 13.4: Run the test**

Run:
```bash
pnpm test:integration tests/integration/customer-link.integration.test.ts
```

Expected: 3 passed.

- [ ] **Step 13.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/customer-link.integration.test.ts
git commit -m "Task 13: Phase 2 — customer_link table

Per spec §10. Email → Square customer_id cache, 1-day TTL enforced
at read time (not via TTL extension). Integration test covers cache,
upsert-on-conflict, and the staleness filter Phase 7 will use."
```

---

## Task 14: `product_cache` table

Per spec §3 Image handling + §18 Square webhooks. Denormalized product snapshot keyed by Square catalog item ID. Refreshed by the `catalog.version.updated` webhook in Phase 3.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/product-cache.integration.test.ts`
- Generate: `drizzle/migrations/0007_*.sql`

- [ ] **Step 14.1: Append product_cache schema**

```typescript
export const productCache = pgTable('product_cache', {
  catalogItemId: text('catalog_item_id').primaryKey(), // Square catalog item ID
  data: jsonb('data').notNull(), // denormalized: name, price, image URLs, custom attrs
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type ProductCacheEntry = typeof productCache.$inferSelect
export type NewProductCacheEntry = typeof productCache.$inferInsert
```

Phase 3 will define the exact shape of `data` (a TypeScript interface) when it wires Square. For Phase 2 we treat it as opaque JSONB.

- [ ] **Step 14.2: Generate and apply the migration**

```bash
pnpm db:generate
pnpm db:push
```

- [ ] **Step 14.3: Create the integration test**

Create `tests/integration/product-cache.integration.test.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('product-cache')

describe('product_cache integration', () => {
  it('caches a product snapshot and reads it back', async () => {
    const catalogItemId = `${NS}_sq_item_1`
    const data = {
      name: 'Naruto — Acrylic Wall Art',
      price_cents: 7500,
      image_urls: ['https://square.example/img1.jpg'],
      custom_attrs: { artist: 'bxnny', ip: 'naruto', product_type: 'acrylic' }
    }
    await db.insert(productCache).values({ catalogItemId, data })

    const [row] = await db
      .select()
      .from(productCache)
      .where(eq(productCache.catalogItemId, catalogItemId))
    expect(row.data).toEqual(data)
    expect(row.updatedAt).toBeInstanceOf(Date)
  })

  it('upserts on catalog.version.updated (Phase 3 webhook pattern)', async () => {
    const catalogItemId = `${NS}_sq_item_2`
    await db.insert(productCache).values({
      catalogItemId,
      data: { name: 'old name', price_cents: 100 }
    })
    await db
      .insert(productCache)
      .values({
        catalogItemId,
        data: { name: 'new name', price_cents: 200 },
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: productCache.catalogItemId,
        set: {
          data: { name: 'new name', price_cents: 200 },
          updatedAt: new Date()
        }
      })
    const [row] = await db
      .select()
      .from(productCache)
      .where(eq(productCache.catalogItemId, catalogItemId))
    expect(row.data).toEqual({ name: 'new name', price_cents: 200 })
  })

  afterAll(async () => {
    await cleanupByPrefix(productCache, 'catalog_item_id', NS)
  })
})
```

- [ ] **Step 14.4: Run the test**

Run:
```bash
pnpm test:integration tests/integration/product-cache.integration.test.ts
```

Expected: 2 passed.

- [ ] **Step 14.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/product-cache.integration.test.ts
git commit -m "Task 14: Phase 2 — product_cache table

Per spec §3 + §18. Denormalized Square catalog snapshot, refreshed
by catalog.version.updated webhook in Phase 3. data column is opaque
JSONB until Phase 3 defines the schema.

Integration test covers cache write and the webhook-driven upsert
pattern (onConflictDoUpdate)."
```

---

## Task 15: `order_log` table

Per spec §18 Square webhooks. Logs every order webhook event for debugging and audit.

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `tests/integration/order-log.integration.test.ts`
- Generate: `drizzle/migrations/0008_*.sql`

- [ ] **Step 15.1: Append order_log schema**

```typescript
export const orderLog = pgTable('order_log', {
  id: serial('id').primaryKey(),
  squareOrderId: text('square_order_id').notNull(),
  eventType: text('event_type').notNull(), // e.g. "order.created", "payment.created"
  payload: jsonb('payload').notNull(), // raw webhook body
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow()
})

export type OrderLogEntry = typeof orderLog.$inferSelect
export type NewOrderLogEntry = typeof orderLog.$inferInsert
```

Note: We do NOT enforce a `event_type` enum at DB level — Square's webhook event types are an expanding set, and we'd rather store unknown events than reject them.

- [ ] **Step 15.2: Generate and apply the migration**

```bash
pnpm db:generate
pnpm db:push
```

- [ ] **Step 15.3: Create the integration test**

Create `tests/integration/order-log.integration.test.ts`:

```typescript
import { desc, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { orderLog } from '@/lib/db/schema'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('order-log')

describe('order_log integration', () => {
  it('logs a webhook event', async () => {
    const squareOrderId = `${NS}_sq_order_1`
    const [row] = await db
      .insert(orderLog)
      .values({
        squareOrderId,
        eventType: 'order.created',
        payload: { merchant_id: 'm_xyz', type: 'order.created', data: { id: squareOrderId } }
      })
      .returning()
    expect(row.id).toBeGreaterThan(0)
    expect(row.eventType).toBe('order.created')
    expect(row.receivedAt).toBeInstanceOf(Date)
  })

  it('orders events for a single order chronologically', async () => {
    const squareOrderId = `${NS}_sq_order_2`
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'order.created',
      payload: { seq: 1 }
    })
    // Small delay to ensure deterministic ordering by received_at.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'payment.created',
      payload: { seq: 2 }
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await db.insert(orderLog).values({
      squareOrderId,
      eventType: 'order.fulfillment.updated',
      payload: { seq: 3 }
    })

    const rows = await db
      .select()
      .from(orderLog)
      .where(eq(orderLog.squareOrderId, squareOrderId))
      .orderBy(desc(orderLog.receivedAt))
    expect(rows.map((r) => r.eventType)).toEqual([
      'order.fulfillment.updated',
      'payment.created',
      'order.created'
    ])
  })

  it('accepts unknown event_type values (no enum constraint)', async () => {
    const squareOrderId = `${NS}_sq_order_3`
    // Square may add new event types over time; we should not reject them.
    const [row] = await db
      .insert(orderLog)
      .values({
        squareOrderId,
        eventType: 'order.future.unknown_event_type',
        payload: {}
      })
      .returning()
    expect(row.eventType).toBe('order.future.unknown_event_type')
  })

  afterAll(async () => {
    await cleanupByPrefix(orderLog, 'square_order_id', NS)
  })
})
```

- [ ] **Step 15.4: Run the test**

Run:
```bash
pnpm test:integration tests/integration/order-log.integration.test.ts
```

Expected: 3 passed.

- [ ] **Step 15.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/ tests/integration/order-log.integration.test.ts
git commit -m "Task 15: Phase 2 — order_log table

Per spec §18. Audit log of every Square webhook event. event_type
is intentionally unconstrained — Square's event set grows, and we'd
rather store unknown events for forensics than reject them.

Integration test covers insert, chronological ordering, and unknown
event_type acceptance."
```

---

## Task 16: NewsletterSignupStub placeholder test

The stub already exists with a state-driven submit handler. Add a placeholder test now so Phase 9's real wiring has a regression net the moment it lands.

**Files:**
- Create: `tests/newsletter-signup-stub.test.tsx`

- [ ] **Step 16.1: Create the test**

```tsx
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NewsletterSignupStub } from '@/components/layout/NewsletterSignupStub'

describe('NewsletterSignupStub', () => {
  it('renders the email input and Subscribe button initially', () => {
    render(<NewsletterSignupStub />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument()
  })

  it('swaps to an acknowledgement on submit', () => {
    render(<NewsletterSignupStub />)
    const input = screen.getByLabelText('Email') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'alice@example.com' } })
    const form = input.closest('form')
    if (!form) throw new Error('expected form to exist')
    fireEvent.submit(form)
    expect(screen.getByText(/newsletter signup launching soon/i)).toBeInTheDocument()
    // Original form is gone after submit.
    expect(screen.queryByRole('button', { name: 'Subscribe' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 16.2: Run the test**

Run:
```bash
pnpm test tests/newsletter-signup-stub.test.tsx
```

Expected: 2 passed.

- [ ] **Step 16.3: Commit**

```bash
git add tests/newsletter-signup-stub.test.tsx
git commit -m "Task 16: Phase 2 — placeholder test for NewsletterSignupStub

Covers the two states (form / acknowledgement) so Phase 9's real
submission wiring has a regression net the moment it changes the
component's behavior."
```

---

## Task 17: End-to-end verification + tag

Final sanity pass — all schemas applied, all tests pass, lint and typecheck green, tag the milestone.

- [ ] **Step 17.1: Confirm Postgres is healthy and full schema is applied**

Run:
```bash
docker compose ps postgres
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs -c "\dt"
```

Expected: `postgres` is `Up (healthy)`. The `\dt` listing shows:
- abandoned_carts
- customer_link
- event_logos
- order_log
- product_cache
- reviews
- site_settings
- sms_recipients
- wishlists

(9 tables total: 1 from Phase 1 + 8 from Phase 2.)

- [ ] **Step 17.2: Run the full unit test suite**

Run:
```bash
pnpm test
```

Expected: all unit tests pass. Counted: env (3), content (4), smoke (1), header (2), footer (3), static-pages (1), newsletter-signup-stub (2). Total **16 unit tests**.

- [ ] **Step 17.3: Run the full integration test suite**

Run:
```bash
pnpm test:integration
```

Expected: all integration tests pass. Counted: site-settings (2), event-logos (3), sms-recipients (3), wishlists (3), reviews (6), abandoned-carts (3), customer-link (3), product-cache (2), order-log (3). Total **28 integration tests**.

- [ ] **Step 17.4: Run typecheck and lint**

Run:
```bash
pnpm typecheck
pnpm lint
```

Expected: both green.

- [ ] **Step 17.5: Run build to confirm production output still works**

Run:
```bash
pnpm build
```

Expected: builds successfully. `server-only` on env.ts does NOT break the build because the only client component (`NewsletterSignupStub`) does not import env.

- [ ] **Step 17.6: Tag Phase 2 complete**

```bash
git tag -a phase-2-schemas -m "Phase 2 complete: all v1 schemas + test infra"
git log --oneline | head -25
```

Expected: tag is in place; the most recent commit is from Task 16.

---

## Phase 2 self-review checklist

Run this before declaring done:

- [ ] **Spec coverage**
  - §3 Image handling → `product_cache` ✓
  - §6.2 Wishlist → `wishlists` ✓
  - §7 Reviews → `reviews` ✓
  - §9 Checkout / abandonment → `abandoned_carts` ✓
  - §10 My Account email→customer_id cache → `customer_link` ✓
  - §11 Storage (site_settings already there) → `event_logos`, `sms_recipients` ✓
  - §18 Webhooks → `order_log` (catalog cache shared with §3) ✓

- [ ] **Carry-forward items**
  - #1 server-only on env.ts → Task 1 ✓
  - #2 .env.example cookie placeholder → Task 2 ✓
  - #3 vi.stubEnv migration → Task 3 ✓
  - #4 biome overrides for tests → Task 4 ✓
  - #5a integration test cleanup convention → Task 7 (`cleanupByPrefix` + per-file `NS`) ✓
  - #5b unit/integration split → Task 7 ✓
  - #6 content-build title type-guard → Task 5 ✓
  - #7 drizzle.config comment refresh → Task 6 ✓
  - #9 NewsletterSignupStub placeholder test → Task 16 ✓
  - #8 / #10 / #11 / #12 → explicitly punted by user, not in Phase 2 ✓

- [ ] **Placeholder scan**
  - Plan contains no TBD / TODO / FIXME left for the implementer.

- [ ] **Type consistency**
  - All Drizzle table names use `camelCase` exports and `snake_case` SQL identifiers consistently.
  - Inferred types follow the pattern `Foo` / `NewFoo` for every table.

---

## Outcome

After Phase 2 ships:
- 9 tables exist in Postgres; all are queryable via Drizzle with type inference.
- `pnpm test` is fast and Docker-free (16 tests).
- `pnpm test:integration` exercises all 9 tables (28 tests).
- `env.ts` is server-only-guarded; client bundles can't import it.
- `.env.example` no longer ships a misleading non-secret value.
- biome rules are scoped appropriately to test vs production code.
- The `cleanupByPrefix` + `testNamespace` pattern is documented in `tests/integration/README.md` and used uniformly.

Phase 3 (Square Catalog integration) can now write directly into `product_cache` and `order_log` without further schema work. It will:
- Define the TypeScript shape for `product_cache.data`.
- Add a setup script that creates the Square custom-attribute definitions (`artist`, `ip`, `product_type`, `sibling_group`).
- Wire the Square webhook handler that fills `order_log` and refreshes `product_cache`.
