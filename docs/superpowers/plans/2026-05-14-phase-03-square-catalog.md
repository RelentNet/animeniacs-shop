# Phase 3: Square Catalog Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Square Catalog API end-to-end. Install the SDK, create the four custom-attribute definitions (`artist`, `ip`, `product_type`, `sibling_group`), denormalize the catalog into the `product_cache` Postgres table, and stand up a signed webhook receiver that refreshes the cache on `catalog.version.updated` and logs orders/payments to `order_log`. Phase 4 (catalog UX) reads from the table this phase populates. No checkout, no UI, no GoAffPro — those are later phases.

**Architecture:** Square Node SDK (`square@^44`) runs server-side only. A singleton `SquareClient` configured via `SQUARE_ENV` (sandbox / production) is exposed from `src/lib/square/client.ts`. The catalog read layer (`src/lib/square/catalog.ts`) returns typed denormalized `CachedProduct` objects, joining item rows with their `CatalogImage` rows. The product cache (`src/lib/products/cache.ts`) is a stale-while-revalidate layer over the `product_cache` table from Phase 2. The webhook handler (`app/api/webhooks/square/route.ts`) verifies HMAC signatures via `WebhooksHelper.verifySignature`, routes events by `type`, and writes audit rows to `order_log`. Local dev uses a Cloudflare tunnel (`cloudflared`) so Square sandbox webhooks reach `localhost:3000`.

**Tech Stack:** `square@^44`, `crypto` (node built-in for signature backup), existing Drizzle / Postgres / Vitest. One new dev dependency for tunneling docs (cloudflared, installed by user as a binary — not via pnpm).

**Outcome at end of Phase 3:**
- Square Node SDK installed and a typed singleton client exported.
- Four custom-attribute definitions live in your Square sandbox catalog (`artist`, `ip`, `product_type`, `sibling_group`), idempotent setup script.
- `pnpm square:sync` backfills every catalog item into `product_cache` with images denormalized.
- `POST /api/webhooks/square` is signature-verified, routes 5 event types, and writes to `order_log`. Catalog change events trigger a delta sync into `product_cache`.
- 14 new unit tests (SDK mocked) + integration tests against the live sandbox.
- Git tag `phase-3-square-catalog` marks the milestone.

**API keys needed:** Square sandbox access token + sandbox location ID + webhook signature key. User supplies these between Task 3 and Task 4 (see the GATE block).

---

## Lessons from Phases 1 and 2 — applied throughout

Every commit step in this plan ends with `pnpm lint:fix && pnpm typecheck` before `git add`. The five paper cuts surfaced during Phase 2 are addressed in advance:

1. **Biome glob brace expansion is a no-op.** Any new biome include/override pattern uses separate `*.ts` and `*.tsx` entries, never `*.{ts,tsx}`.
2. **`vi.stubEnv('FOO', '')` does not unset.** Use `vi.stubEnv('FOO', undefined)` whenever a test needs an env var to be absent.
3. **Drizzle's `text({ enum: [...] })` is a TS hint, not a SQL constraint.** Phase 3 doesn't add new Postgres tables, so this only matters if we extend an existing one. If we do, use explicit `check(name, sql\`...\`)`.
4. **`pnpm db:push` hangs without `--force`.** Every db-push step in this plan uses `DATABASE_URL="postgres://animeniacs:animeniacs@localhost:5433/animeniacs" pnpm db:push --force`. (Note port 5433.)
5. **biome formatter runs before commit.** Every commit step does `pnpm lint:fix` first.

---

## File structure after Phase 3

```
animeniacs-shop/
├── .env.example                                  ← MODIFIED: Square block fleshed out
├── package.json                                  ← MODIFIED: square@^44 dep + square:sync script
│
├── docs/superpowers/specs/
│   └── reference/
│       └── square-sandbox-setup.md               ← NEW: step-by-step for user to share keys
│
├── src/
│   ├── lib/
│   │   ├── env.ts                                ← MODIFIED: Square env vars added to schema
│   │   ├── square/
│   │   │   ├── client.ts                         ← NEW: SquareClient singleton + env switching
│   │   │   ├── catalog.ts                        ← NEW: typed list/get/search/byTag readers
│   │   │   ├── custom-attributes.ts              ← NEW: setup script logic
│   │   │   ├── webhook-signature.ts              ← NEW: thin wrapper over WebhooksHelper
│   │   │   └── types.ts                          ← NEW: CachedProduct + CustomAttrKeys types
│   │   └── products/
│   │       └── cache.ts                          ← NEW: read-through SWR cache layer
│   │
│   └── app/
│       └── api/
│           └── webhooks/
│               └── square/
│                   └── route.ts                  ← NEW: POST handler
│
├── scripts/
│   ├── square-setup-custom-attributes.ts         ← NEW: pnpm square:setup
│   └── square-sync.ts                            ← NEW: pnpm square:sync
│
└── tests/
    ├── square/
    │   ├── webhook-signature.test.ts             ← NEW: unit, known-good payloads
    │   ├── catalog-parser.test.ts                ← NEW: unit, mocked SDK responses
    │   └── product-cache.test.ts                 ← NEW: unit, mocked SDK + real DB? NO → mocked DB
    └── integration/
        └── square/
            ├── README.md                         ← NEW: sandbox-required tests
            ├── catalog-read.integration.test.ts  ← NEW: hits real sandbox
            └── product-cache.integration.test.ts ← NEW: full SWR loop against sandbox
```

---

## Task 1: Install Square SDK and define env vars

Key-free. Install the package, extend the env schema, update `.env.example`.

**Files:**
- Modify: `package.json` (add `square@^44`)
- Modify: `src/lib/env.ts` (add Square block)
- Modify: `.env.example` (already has placeholders; refine the comments)
- Modify: `tests/env.test.ts` (cover the new env vars where it changes default behavior)

- [ ] **Step 1.1: Install the Square SDK**

Run:
```bash
pnpm add square@^44
```

Expected: `package.json` gets `"square": "^44.0.1"` (or current) in `dependencies`. `pnpm-lock.yaml` updates.

- [ ] **Step 1.2: Extend the env schema**

Edit `src/lib/env.ts`. Add the Square block to the zod object. The full updated schema:

```typescript
import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  LOGTO_ENDPOINT: z.string().url().default('http://localhost:3001'),
  LOGTO_APP_ID: z.string().min(1).optional(),
  LOGTO_APP_SECRET: z.string().min(1).optional(),
  LOGTO_COOKIE_SECRET: z.string().min(32).optional(),

  // Square (Phase 3)
  // Sandbox keys are required for any dev where the SDK is touched.
  // Production keys arrive at Phase 17.
  SQUARE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  SQUARE_ACCESS_TOKEN: z.string().min(1).optional(),
  SQUARE_LOCATION_ID: z.string().min(1).optional(),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().min(1).optional()
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
  return result.data
}

export const env = parseEnv()
```

Note: all three Square vars are `.optional()` because the unit test suite (and the homepage build) must not require them. Code paths that actually call Square will check for `env.SQUARE_ACCESS_TOKEN` presence at runtime and throw a clear error if missing.

- [ ] **Step 1.3: Refine .env.example comments**

The existing block reads:

```bash
# Square (Phase 3) — leave blank for now
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
SQUARE_WEBHOOK_SIGNATURE_KEY=
SQUARE_ENV=sandbox
```

Replace with:

```bash
# Square (Phase 3)
# Get sandbox keys from https://developer.squareup.com/apps → your app → Sandbox.
# Webhook signature key is set when you create a webhook subscription
# (Phase 3 Task 13 covers this).
SQUARE_ENV=sandbox
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
SQUARE_WEBHOOK_SIGNATURE_KEY=
```

- [ ] **Step 1.4: Add an env test for the new vars**

Edit `tests/env.test.ts`. Append two cases to the existing `describe('env loader', ...)` block (before `afterEach`):

```typescript
  it('defaults SQUARE_ENV to sandbox', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ENV', undefined)
    const mod = await import('../src/lib/env')
    expect(mod.env.SQUARE_ENV).toBe('sandbox')
  })

  it('rejects an invalid SQUARE_ENV value', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ENV', 'staging')
    await expect(import('../src/lib/env')).rejects.toThrow('Invalid environment configuration')
  })
```

- [ ] **Step 1.5: Run the unit suite**

Run:
```bash
pnpm test
```

Expected: 18 tests pass (16 previous + 2 new).

- [ ] **Step 1.6: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 1.7: Lint-fix and commit**

```bash
pnpm lint:fix
git add package.json pnpm-lock.yaml src/lib/env.ts .env.example tests/env.test.ts
git commit -m "Task 1: Phase 3 — install Square SDK and add env vars

square@^44 added as a dependency. env.ts now validates:
  - SQUARE_ENV (sandbox|production, defaults sandbox)
  - SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID,
    SQUARE_WEBHOOK_SIGNATURE_KEY (all optional at the env layer;
    code paths that call Square enforce presence at runtime so
    unrelated unit tests don't require sandbox credentials)

Env tests cover SQUARE_ENV default and rejection of invalid values."
```

---

## Task 2: TypeScript types for cached products and custom-attribute keys

Key-free. Define the shape we'll write into `product_cache.data` (previously opaque JSONB), plus the keys for the four custom attributes. This locks the schema for Phase 4 (catalog UX) to consume.

**Files:**
- Create: `src/lib/square/types.ts`

- [ ] **Step 2.1: Create the types file**

```typescript
import 'server-only'

/**
 * Keys for the four catalog custom attribute definitions Phase 3 creates.
 * The `as const` union is used directly in code paths that pluck attribute
 * values from a CatalogItem.
 */
export const CUSTOM_ATTR_KEYS = {
  ARTIST: 'artist',
  IP: 'ip',
  PRODUCT_TYPE: 'product_type',
  SIBLING_GROUP: 'sibling_group'
} as const

export type CustomAttrKey = (typeof CUSTOM_ATTR_KEYS)[keyof typeof CUSTOM_ATTR_KEYS]

/**
 * Allowed values for the `product_type` Selection custom attribute.
 * Mirrors the spec §3 enum. New values require a Square dashboard edit
 * AND a code change here.
 */
export const PRODUCT_TYPES = [
  'acrylic',
  'vinyl',
  'lit-box',
  'acoustic-panel',
  'accessory',
  'custom'
] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

/**
 * Money values from Square are integers in the smallest currency unit
 * (cents for USD). We preserve that on the cache side.
 */
export interface CachedMoney {
  amount: number
  currency: string
}

/**
 * One catalog item variation (size, material, etc.) denormalized for
 * fast read. Phase 3 stores variations inline; Phase 4 surfaces them
 * as the variant picker.
 */
export interface CachedVariation {
  id: string
  name: string
  price: CachedMoney | null
  sku: string | null
}

/**
 * The denormalized product blob written into product_cache.data.
 *
 * - `images` is an ordered list; `images[0]` is the primary.
 * - `customAttributes` is keyed by our CUSTOM_ATTR_KEYS values.
 *   A missing key means the staff didn't set that attribute on this
 *   item; consumers must handle the absent case.
 * - `categoryIds` maps to Square category IDs; Phase 4 resolves them
 *   to names via a separate category lookup.
 */
export interface CachedProduct {
  id: string
  name: string
  description: string | null
  descriptionHtml: string | null
  variations: CachedVariation[]
  images: string[]
  categoryIds: string[]
  customAttributes: Partial<Record<CustomAttrKey, string>>
  updatedAt: string // ISO-8601 from Square
}

/**
 * Helper type guard for the Selection-typed product_type value.
 */
export function isProductType(value: string | undefined): value is ProductType {
  return value !== undefined && (PRODUCT_TYPES as readonly string[]).includes(value)
}
```

- [ ] **Step 2.2: Add a unit test for the type guard**

Create `tests/square/types.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { isProductType, PRODUCT_TYPES } from '@/lib/square/types'

describe('isProductType', () => {
  it('accepts every value in PRODUCT_TYPES', () => {
    for (const value of PRODUCT_TYPES) {
      expect(isProductType(value)).toBe(true)
    }
  })

  it('rejects unknown values', () => {
    expect(isProductType('poster')).toBe(false)
    expect(isProductType('')).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isProductType(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2.3: Run tests and typecheck**

```bash
pnpm test tests/square/types.test.ts
pnpm typecheck
```

Expected: 3 passed, typecheck exits 0.

- [ ] **Step 2.4: Lint-fix and commit**

```bash
pnpm lint:fix
git add src/lib/square/types.ts tests/square/types.test.ts
git commit -m "Task 2: Phase 3 — types for cached products and custom attrs

Defines:
  - CUSTOM_ATTR_KEYS const + CustomAttrKey union (4 attribute keys)
  - PRODUCT_TYPES const + ProductType union (6 allowed product types)
  - CachedMoney / CachedVariation / CachedProduct (the shape written
    into product_cache.data; previously opaque JSONB from Phase 2)
  - isProductType() type guard

Phase 4 consumes CachedProduct directly from the cache table; this
file locks the contract."
```

---

## Task 3: Square client singleton with sandbox/prod switching

Key-free at construction time (the client can be instantiated with a placeholder token; it only fails when you actually make a call). Unit-tested with the SDK mocked.

**Files:**
- Create: `src/lib/square/client.ts`
- Create: `tests/square/client.test.ts`

- [ ] **Step 3.1: Create the client singleton**

```typescript
import 'server-only'
import { SquareClient, SquareEnvironment } from 'square'
import { env } from '@/lib/env'

/**
 * Module-level singleton so we don't churn TCP connections in dev hot-reloads.
 * The pattern mirrors src/lib/db/client.ts.
 */
const globalForSquare = globalThis as unknown as { __squareClient?: SquareClient }

function buildClient(): SquareClient {
  if (!env.SQUARE_ACCESS_TOKEN) {
    throw new Error(
      'SQUARE_ACCESS_TOKEN is not set. Add it to .env.local before calling Square.'
    )
  }
  return new SquareClient({
    token: env.SQUARE_ACCESS_TOKEN,
    environment:
      env.SQUARE_ENV === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
  })
}

export function getSquareClient(): SquareClient {
  if (!globalForSquare.__squareClient) {
    globalForSquare.__squareClient = buildClient()
  }
  return globalForSquare.__squareClient
}

/**
 * Resets the cached client. Test-only; safe to leave in the bundle because
 * it's a tiny function with no side effects until called.
 */
export function __resetSquareClientForTests(): void {
  globalForSquare.__squareClient = undefined
}
```

- [ ] **Step 3.2: Create the unit test**

```typescript
// tests/square/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Square client singleton', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws a clear error if SQUARE_ACCESS_TOKEN is missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', undefined)
    const mod = await import('@/lib/square/client')
    expect(() => mod.getSquareClient()).toThrow(/SQUARE_ACCESS_TOKEN is not set/)
  })

  it('constructs a client when SQUARE_ACCESS_TOKEN is set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', 'fake_sandbox_token_for_test')
    vi.stubEnv('SQUARE_ENV', 'sandbox')
    const mod = await import('@/lib/square/client')
    const client = mod.getSquareClient()
    expect(client).toBeDefined()
    // Singleton: second call returns the same instance.
    expect(mod.getSquareClient()).toBe(client)
  })

  it('honors SQUARE_ENV=production', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', 'fake_prod_token_for_test')
    vi.stubEnv('SQUARE_ENV', 'production')
    const mod = await import('@/lib/square/client')
    const client = mod.getSquareClient()
    expect(client).toBeDefined()
    // We can't introspect environment from the public API without making a call,
    // but constructing without throwing is enough at this level.
  })
})
```

- [ ] **Step 3.3: Run tests and typecheck**

```bash
pnpm test tests/square/client.test.ts
pnpm typecheck
```

Expected: 3 passed.

- [ ] **Step 3.4: Lint-fix and commit**

```bash
pnpm lint:fix
git add src/lib/square/client.ts tests/square/client.test.ts
git commit -m "Task 3: Phase 3 — Square client singleton

new SquareClient({ token, environment }) wrapped behind getSquareClient()
with HMR-safe globalThis caching (same pattern as src/lib/db/client.ts).

Throws a clear runtime error if SQUARE_ACCESS_TOKEN is missing, so
the rest of the codebase can call getSquareClient() without
defensive null checks.

__resetSquareClientForTests() lets unit tests force a fresh client.
The function is exported but harmless in production."
```

---

## GATE: User action required

**The next tasks need real Square sandbox credentials. Stop here and confirm with the user that they have created the sandbox app and shared the keys.**

Required:

1. **Square Developer account.** User signs up at https://developer.squareup.com/ if they haven't.
2. **Sandbox application.** User creates a new Application in the Developer Dashboard. From the application's **Sandbox** tab they collect:
   - Sandbox **Access Token** → `SQUARE_ACCESS_TOKEN`
   - Sandbox **Default Test Account → Locations** → first location's ID → `SQUARE_LOCATION_ID`
3. **User pastes both into `.env.local`** and re-runs the local app:
   ```bash
   docker compose --env-file .env.local up -d
   ```
4. **Verify the keys work** by curling the sandbox locations endpoint (no setup needed):
   ```bash
   source .env.local
   curl -sS https://connect.squareupsandbox.com/v2/locations \
     -H "Authorization: Bearer $SQUARE_ACCESS_TOKEN" \
     -H "Square-Version: 2025-04-16" | head
   ```
   Expected: JSON containing a `locations` array with at least one entry. The `id` field on the first location should match what the user put in `SQUARE_LOCATION_ID`.

The webhook signature key is generated in Task 13 when we create the webhook subscription. Tasks 4–12 don't need it.

Once the user confirms keys are in `.env.local` and the curl works, proceed to Task 4.

A standalone setup doc is produced as part of Task 4 so future deployments don't lose this context.

---

## Task 4: Document the Square sandbox setup procedure

Now that the user has stood up the sandbox and the keys are in `.env.local`, capture the procedure as a checked-in reference. Future devs (and Phase 17's production deploy) need this.

**Files:**
- Create: `docs/superpowers/specs/reference/square-sandbox-setup.md`

- [ ] **Step 4.1: Write the setup doc**

```markdown
# Square sandbox setup — reference

This doc captures the manual steps to provision the Square sandbox credentials
this app needs. Run through it once per environment (local dev, Coolify staging,
Coolify production). The same flow works for production-tier credentials in
Phase 17; just use the **Production** tab instead of **Sandbox** and paste the
keys into the appropriate Coolify env-var UI.

## 1. Create a Square Developer account

https://developer.squareup.com/ → Sign up. Personal account is fine for dev.

## 2. Create a sandbox application

1. Developer Dashboard → **Applications** → **+ Create application**.
2. Name: `Animeniacs Shop (sandbox)` (or `… (production)` for prod).
3. Open the new application.
4. Switch to the **Sandbox** tab at the top.

## 3. Collect the credentials

From the Sandbox tab:

| Square dashboard field | Maps to .env.local var |
|---|---|
| Sandbox Access Token | `SQUARE_ACCESS_TOKEN` |
| Default Test Account → Locations → first row's ID | `SQUARE_LOCATION_ID` |
| (Generated in Task 13 below) Webhook subscription signature key | `SQUARE_WEBHOOK_SIGNATURE_KEY` |

Set `SQUARE_ENV=sandbox` in the same file.

## 4. Smoke-test the access token

```bash
source .env.local
curl -sS https://connect.squareupsandbox.com/v2/locations \
  -H "Authorization: Bearer $SQUARE_ACCESS_TOKEN" \
  -H "Square-Version: 2025-04-16"
```

Expected: JSON with a `locations` array. The first location's `id` should
match `SQUARE_LOCATION_ID`.

If you see `{"errors":[{"category":"AUTHENTICATION_ERROR",...}]}`, the access
token is wrong or you copied it from the Production tab into a sandbox URL.

## 5. (Phase 3 Task 13) Subscribe to webhooks

After the catalog setup script runs and the dev tunnel is live:

1. Developer Dashboard → application → Sandbox → **Webhooks** → **+ Add subscription**.
2. **Notification URL:** the public URL of your tunnel + `/api/webhooks/square`
   (e.g., `https://animeniacs-dev.trycloudflare.com/api/webhooks/square`).
3. **API version:** match the version pinned in `src/lib/square/client.ts`
   (the SDK pins one).
4. **Events:** subscribe to:
   - `catalog.version.updated`
   - `order.created`
   - `order.updated`
   - `order.fulfillment.updated`
   - `payment.created`
5. Save.
6. Reveal the **Signature Key** for this subscription and paste it into
   `.env.local` as `SQUARE_WEBHOOK_SIGNATURE_KEY`.
7. Restart the app so the new env var is picked up:
   ```bash
   docker compose --env-file .env.local up -d --build app
   ```
8. In the webhook subscription detail page, click **Send Test Event** for any of
   the event types. The app's logs should show a 200 response and a row should
   land in `order_log`. (Catalog test events also update `product_cache`.)

## 6. Production handoff (Phase 17)

For production, repeat the process on the application's **Production** tab.
The notification URL will be `https://animeniacs.shop/api/webhooks/square`.
Production keys are stored in Coolify's env-var UI, NOT in `.env.local`.
```

- [ ] **Step 4.2: Commit**

```bash
git add docs/superpowers/specs/reference/square-sandbox-setup.md
git commit -m "Task 4: Phase 3 — Square sandbox setup reference doc

Captures the manual provisioning steps so Phase 17 (production
deploy) and any future dev environment can repeat the flow without
re-deriving it. Includes the webhook subscription steps that
Task 13 will pull the user back into."
```

---

## Task 5: One-time custom attribute setup script

Creates the four catalog custom attribute definitions in the sandbox. Idempotent — running it twice does not create duplicates.

**Files:**
- Create: `src/lib/square/custom-attributes.ts`
- Create: `scripts/square-setup-custom-attributes.ts`
- Modify: `package.json` (add `square:setup` script)

- [ ] **Step 5.1: Create the setup-logic module**

```typescript
// src/lib/square/custom-attributes.ts
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SquareClient } from 'square'
import { CUSTOM_ATTR_KEYS, PRODUCT_TYPES } from './types'

/**
 * Definition for one custom attribute. The schema follows Square's
 * catalog-custom-attribute meta-schema. We always set:
 *   - seller_visibility: SELLER_VISIBILITY_READ_WRITE_VALUES
 *     (staff can edit the value in the Square dashboard item editor)
 *   - app_visibility: APP_VISIBILITY_HIDDEN (default; only our app sees it)
 *   - allowed_object_types: ['ITEM']  (attributes attach to items, not variations)
 */
interface AttrDef {
  key: string
  name: string
  description: string
  schemaType: 'STRING' | 'SELECTION'
  selectionNames?: readonly string[]
}

const DEFINITIONS: readonly AttrDef[] = [
  {
    key: CUSTOM_ATTR_KEYS.ARTIST,
    name: 'Artist',
    description: 'Slug of the artist who created this piece (matches GoAffPro).',
    schemaType: 'STRING'
  },
  {
    key: CUSTOM_ATTR_KEYS.IP,
    name: 'IP / Franchise',
    description: 'Slug of the IP this art is from (e.g. naruto, dragon-ball).',
    schemaType: 'STRING'
  },
  {
    key: CUSTOM_ATTR_KEYS.PRODUCT_TYPE,
    name: 'Product Type',
    description: 'Drives PDP layout and shop filtering.',
    schemaType: 'SELECTION',
    selectionNames: PRODUCT_TYPES
  },
  {
    key: CUSTOM_ATTR_KEYS.SIBLING_GROUP,
    name: 'Sibling Group',
    description:
      'Pairs Acrylic + Vinyl versions of the same artwork. Use the same ID on both items.',
    schemaType: 'STRING'
  }
]

interface SetupResult {
  created: string[]
  skipped: string[]
}

export async function setupCustomAttributes(client: SquareClient): Promise<SetupResult> {
  const existing = await listExistingDefinitionKeys(client)
  const created: string[] = []
  const skipped: string[] = []

  for (const def of DEFINITIONS) {
    if (existing.has(def.key)) {
      skipped.push(def.key)
      continue
    }
    await createDefinition(client, def)
    created.push(def.key)
  }

  return { created, skipped }
}

async function listExistingDefinitionKeys(client: SquareClient): Promise<Set<string>> {
  const keys = new Set<string>()
  // Square's SDK exposes an async iterator over paginated catalog responses.
  const response = await client.catalog.list({
    types: 'CUSTOM_ATTRIBUTE_DEFINITION'
  })
  for await (const obj of response) {
    if (obj.type === 'CUSTOM_ATTRIBUTE_DEFINITION' && obj.customAttributeDefinitionData?.key) {
      keys.add(obj.customAttributeDefinitionData.key)
    }
  }
  return keys
}

async function createDefinition(client: SquareClient, def: AttrDef): Promise<void> {
  const schema =
    def.schemaType === 'STRING'
      ? {
          $ref: 'https://developer-production-s.squarecdn.com/schemas/v1/common.json#squareup.common.String'
        }
      : {
          $schema:
            'https://developer-production-s.squarecdn.com/meta-schemas/v1/selection.json',
          type: 'array',
          uniqueItems: true,
          maxItems: 1,
          items: { names: [...(def.selectionNames ?? [])] }
        }

  await client.catalog.object.upsert({
    idempotencyKey: randomUUID(),
    object: {
      type: 'CUSTOM_ATTRIBUTE_DEFINITION',
      id: `#${def.key}`, // temporary client-side ID; Square assigns the real one
      customAttributeDefinitionData: {
        key: def.key,
        name: def.name,
        description: def.description,
        sellerVisibility: 'SELLER_VISIBILITY_READ_WRITE_VALUES',
        appVisibility: 'APP_VISIBILITY_READ_WRITE_VALUES',
        allowedObjectTypes: ['ITEM'],
        schema
      }
    }
  })
}
```

Note on `appVisibility`: we use `READ_WRITE_VALUES` (not `HIDDEN`) so the value shows up in the seller's Square Dashboard item editor. This is the whole reason we chose seller-visible definitions over hidden ones.

Note on `client.catalog.list({ types: 'CUSTOM_ATTRIBUTE_DEFINITION' })`: in `square@^44` the listing method returns an async iterable. The exact signature should be cross-checked against the installed version of the SDK before the subagent commits; if the SDK exposes a different paginator API, adjust the iteration without changing the rest of the file.

- [ ] **Step 5.2: Create the runner script**

```typescript
// scripts/square-setup-custom-attributes.ts
#!/usr/bin/env tsx
import { getSquareClient } from '../src/lib/square/client'
import { setupCustomAttributes } from '../src/lib/square/custom-attributes'

async function main(): Promise<void> {
  const client = getSquareClient()
  const result = await setupCustomAttributes(client)

  if (result.created.length > 0) {
    console.log(`Created ${result.created.length} definition(s):`)
    for (const key of result.created) {
      console.log(`  + ${key}`)
    }
  }

  if (result.skipped.length > 0) {
    console.log(`Skipped ${result.skipped.length} existing definition(s):`)
    for (const key of result.skipped) {
      console.log(`  = ${key}`)
    }
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error('square:setup failed:', err)
  process.exit(1)
})
```

- [ ] **Step 5.3: Add the package.json script**

Add `"square:setup": "tsx scripts/square-setup-custom-attributes.ts"` to the scripts block. After the change, the scripts block contains it in alphabetical order around the other `square:*` and `db:*` entries.

- [ ] **Step 5.4: Run the script**

Confirm `SQUARE_ACCESS_TOKEN` is in your shell env (or in `.env.local` if you've added a dotenv loader to the tsx invocation). The simplest local-dev path:

```bash
set -a
source .env.local
set +a
pnpm square:setup
```

Expected output (first run):
```
Created 4 definition(s):
  + artist
  + ip
  + product_type
  + sibling_group
Done.
```

Second run:
```
Skipped 4 existing definition(s):
  = artist
  = ip
  = product_type
  = sibling_group
Done.
```

- [ ] **Step 5.5: Verify in the Square Dashboard**

Open the Square Sandbox dashboard → Items → create or edit any item. Scroll to the bottom; the four custom-attribute fields should appear (Artist, IP / Franchise, Product Type, Sibling Group). Product Type renders as a dropdown with six options.

If they don't appear, the most likely cause is `sellerVisibility` not being `SELLER_VISIBILITY_READ_WRITE_VALUES`. Re-run the script after fixing.

- [ ] **Step 5.6: Lint-fix and commit**

```bash
pnpm lint:fix
git add src/lib/square/custom-attributes.ts scripts/square-setup-custom-attributes.ts package.json
git commit -m "Task 5: Phase 3 — custom attribute setup script

pnpm square:setup creates four catalog custom-attribute definitions
in the configured Square environment:

  - artist          (string)
  - ip              (string)
  - product_type    (selection: acrylic, vinyl, lit-box,
                     acoustic-panel, accessory, custom)
  - sibling_group   (string)

All four are seller-visible (staff can edit in the Square dashboard
item editor), app-visible-read-write to our app, attached to ITEM
catalog objects only.

Idempotent: re-runs skip definitions that already exist by key."
```

---

## Task 6: Catalog read functions

Wrap the SDK in typed, side-effect-free readers. Phase 3 callers (the cache layer) use these; Phase 4 doesn't import the SDK directly.

**Files:**
- Create: `src/lib/square/catalog.ts`
- Create: `tests/square/catalog-parser.test.ts`

- [ ] **Step 6.1: Implement the catalog readers**

```typescript
// src/lib/square/catalog.ts
import 'server-only'
import type { CatalogObject, SquareClient } from 'square'
import type { CachedProduct, CachedVariation, CustomAttrKey } from './types'

/**
 * Lists every ITEM in the catalog as denormalized CachedProduct rows.
 * Used by `pnpm square:sync` on first boot.
 */
export async function listAllProducts(client: SquareClient): Promise<CachedProduct[]> {
  const items: CatalogObject[] = []
  const imageIds = new Set<string>()

  const response = await client.catalog.list({ types: 'ITEM' })
  for await (const obj of response) {
    if (obj.type === 'ITEM') {
      items.push(obj)
      for (const id of obj.itemData?.imageIds ?? []) imageIds.add(id)
    }
  }

  const imageUrls = await fetchImageUrls(client, [...imageIds])
  return items.map((item) => denormalizeItem(item, imageUrls))
}

/**
 * Retrieves a single item by Square catalog ID, denormalized.
 */
export async function getProductById(
  client: SquareClient,
  catalogItemId: string
): Promise<CachedProduct | null> {
  const response = await client.catalog.object.get({ objectId: catalogItemId })
  const obj = response.object
  if (!obj || obj.type !== 'ITEM') return null

  const imageIds = obj.itemData?.imageIds ?? []
  const imageUrls = await fetchImageUrls(client, imageIds)
  return denormalizeItem(obj, imageUrls)
}

/**
 * Returns CachedProduct rows that changed at or after `beginTime`.
 * Used by the catalog.version.updated webhook handler for delta sync.
 *
 * `beginTime` is an ISO-8601 string. Pass the value previously stored in
 * site_settings under key 'square_last_catalog_sync_at'.
 */
export async function listProductsChangedSince(
  client: SquareClient,
  beginTime: string
): Promise<CachedProduct[]> {
  const items: CatalogObject[] = []
  const imageIds = new Set<string>()

  const response = await client.catalog.searchCatalogObjects({
    objectTypes: ['ITEM'],
    beginTime,
    includeDeletedObjects: false,
    limit: 100
  })

  // searchCatalogObjects returns a paginated response; iterate via cursor.
  // The square@^44 SDK exposes this either as an async iterable or as a
  // response.cursor field — verify the actual shape against the SDK when
  // implementing and adjust this loop to match.
  for await (const obj of response.objects ?? []) {
    if (obj.type === 'ITEM') {
      items.push(obj)
      for (const id of obj.itemData?.imageIds ?? []) imageIds.add(id)
    }
  }

  const imageUrls = await fetchImageUrls(client, [...imageIds])
  return items.map((item) => denormalizeItem(item, imageUrls))
}

// ---------- internals ----------

async function fetchImageUrls(
  client: SquareClient,
  imageIds: string[]
): Promise<Map<string, string>> {
  if (imageIds.length === 0) return new Map()

  const response = await client.catalog.batchRetrieve({
    objectIds: imageIds,
    includeRelatedObjects: false
  })

  const map = new Map<string, string>()
  for (const obj of response.objects ?? []) {
    if (obj.type === 'IMAGE' && obj.imageData?.url) {
      map.set(obj.id, obj.imageData.url)
    }
  }
  return map
}

export function denormalizeItem(
  item: CatalogObject,
  imageUrls: Map<string, string>
): CachedProduct {
  if (item.type !== 'ITEM' || !item.itemData) {
    throw new Error(`denormalizeItem called with non-ITEM catalog object: ${item.type}`)
  }

  const variations: CachedVariation[] = (item.itemData.variations ?? [])
    .filter((v): v is typeof v & { type: 'ITEM_VARIATION' } => v.type === 'ITEM_VARIATION')
    .map((v) => ({
      id: v.id,
      name: v.itemVariationData?.name ?? '',
      price: v.itemVariationData?.priceMoney
        ? {
            amount: Number(v.itemVariationData.priceMoney.amount ?? 0),
            currency: v.itemVariationData.priceMoney.currency ?? 'USD'
          }
        : null,
      sku: v.itemVariationData?.sku ?? null
    }))

  const images = (item.itemData.imageIds ?? [])
    .map((id) => imageUrls.get(id))
    .filter((url): url is string => Boolean(url))

  const categoryIds = item.itemData.categories?.map((c) => c.id).filter(Boolean) ?? []

  const customAttributes: Partial<Record<CustomAttrKey, string>> = {}
  const attrs = item.customAttributeValues ?? {}
  for (const [_, value] of Object.entries(attrs)) {
    if (!value.key) continue
    // String attrs: stringValue. Selection attrs: selectionUidValues / names.
    const stringValue =
      value.stringValue ??
      (value.selectionUidValues && value.selectionUidValues.length > 0
        ? value.selectionUidValues[0]
        : undefined)
    if (stringValue) {
      // Type assertion is safe because we control the keys we created in
      // Task 5; any value.key that isn't in CUSTOM_ATTR_KEYS gets stored
      // anyway, just under a slot the consumer won't read.
      customAttributes[value.key as CustomAttrKey] = stringValue
    }
  }

  return {
    id: item.id,
    name: item.itemData.name ?? '',
    description: item.itemData.description ?? null,
    descriptionHtml: item.itemData.descriptionHtml ?? null,
    variations,
    images,
    categoryIds,
    customAttributes,
    updatedAt: item.updatedAt ?? new Date().toISOString()
  }
}
```

Note: The `square@^44` SDK's exact method names and shapes are pinned to the installed version. If `client.catalog.object.get`, `client.catalog.list`, `client.catalog.searchCatalogObjects`, or `client.catalog.batchRetrieve` differ from what's shown above, the subagent adjusts the wrapper calls without changing the function signatures or the test contract. The `denormalizeItem` function is pure and SDK-independent — its tests pin behavior.

- [ ] **Step 6.2: Unit-test the denormalizer with mocked SDK shapes**

```typescript
// tests/square/catalog-parser.test.ts
import { describe, expect, it } from 'vitest'
import { denormalizeItem } from '@/lib/square/catalog'

describe('denormalizeItem', () => {
  it('produces a CachedProduct from a full ITEM', () => {
    const item = {
      type: 'ITEM',
      id: 'sq_item_abc',
      updatedAt: '2026-01-15T10:00:00Z',
      itemData: {
        name: 'Naruto — Acrylic Wall Art',
        description: 'Plain text desc',
        descriptionHtml: '<p>Plain text desc</p>',
        imageIds: ['img_1', 'img_2'],
        categories: [{ id: 'cat_anime' }, { id: 'cat_acrylic' }],
        variations: [
          {
            type: 'ITEM_VARIATION',
            id: 'sq_var_1',
            itemVariationData: {
              name: 'Standard',
              priceMoney: { amount: 7500n, currency: 'USD' },
              sku: 'NRT-ACR-001'
            }
          }
        ]
      },
      customAttributeValues: {
        unused_slot_key: {
          key: 'artist',
          stringValue: 'bxnny'
        },
        another_slot: {
          key: 'ip',
          stringValue: 'naruto'
        }
      }
    }
    const images = new Map([
      ['img_1', 'https://cdn.sq/img1.jpg'],
      ['img_2', 'https://cdn.sq/img2.jpg']
    ])
    const result = denormalizeItem(item as any, images)

    expect(result.id).toBe('sq_item_abc')
    expect(result.name).toBe('Naruto — Acrylic Wall Art')
    expect(result.images).toEqual(['https://cdn.sq/img1.jpg', 'https://cdn.sq/img2.jpg'])
    expect(result.categoryIds).toEqual(['cat_anime', 'cat_acrylic'])
    expect(result.variations).toHaveLength(1)
    expect(result.variations[0]).toEqual({
      id: 'sq_var_1',
      name: 'Standard',
      price: { amount: 7500, currency: 'USD' },
      sku: 'NRT-ACR-001'
    })
    expect(result.customAttributes.artist).toBe('bxnny')
    expect(result.customAttributes.ip).toBe('naruto')
  })

  it('handles missing optional fields', () => {
    const item = {
      type: 'ITEM',
      id: 'sq_item_min',
      updatedAt: '2026-01-15T10:00:00Z',
      itemData: { name: 'Bare item' }
    }
    const result = denormalizeItem(item as any, new Map())
    expect(result.name).toBe('Bare item')
    expect(result.description).toBeNull()
    expect(result.descriptionHtml).toBeNull()
    expect(result.images).toEqual([])
    expect(result.categoryIds).toEqual([])
    expect(result.variations).toEqual([])
    expect(result.customAttributes).toEqual({})
  })

  it('skips images whose URL the batch retrieve did not return', () => {
    const item = {
      type: 'ITEM',
      id: 'sq_item_partial',
      updatedAt: '2026-01-15T10:00:00Z',
      itemData: { name: 'Half-images', imageIds: ['img_a', 'img_missing'] }
    }
    const images = new Map([['img_a', 'https://cdn.sq/a.jpg']])
    const result = denormalizeItem(item as any, images)
    expect(result.images).toEqual(['https://cdn.sq/a.jpg'])
  })

  it('throws on a non-ITEM catalog object', () => {
    const obj = { type: 'IMAGE', id: 'img_x' }
    expect(() => denormalizeItem(obj as any, new Map())).toThrow(/non-ITEM/)
  })

  it('converts price amount from bigint to number', () => {
    const item = {
      type: 'ITEM',
      id: 'sq_bigint',
      updatedAt: '2026-01-15T10:00:00Z',
      itemData: {
        name: 'Bigint price',
        variations: [
          {
            type: 'ITEM_VARIATION',
            id: 'sq_var_big',
            itemVariationData: {
              name: 'Default',
              priceMoney: { amount: 9999n, currency: 'USD' }
            }
          }
        ]
      }
    }
    const result = denormalizeItem(item as any, new Map())
    expect(result.variations[0].price).toEqual({ amount: 9999, currency: 'USD' })
    expect(typeof result.variations[0].price?.amount).toBe('number')
  })
})
```

- [ ] **Step 6.3: Run tests**

```bash
pnpm test tests/square/catalog-parser.test.ts
```

Expected: 5 passed.

- [ ] **Step 6.4: Lint-fix and commit**

```bash
pnpm lint:fix
git add src/lib/square/catalog.ts tests/square/catalog-parser.test.ts
git commit -m "Task 6: Phase 3 — catalog read functions and denormalizer

src/lib/square/catalog.ts exposes:
  - listAllProducts()          for backfill (pnpm square:sync)
  - getProductById()           for cache miss / refresh
  - listProductsChangedSince() for catalog.version.updated delta
  - denormalizeItem()          pure transform; SDK-shape independent

Unit tests pin denormalizeItem behavior with mocked SDK responses,
covering: full happy path, missing optional fields, partial image
batches, non-ITEM input rejection, and bigint→number price coercion."
```

---

## Task 7: Product cache layer (stale-while-revalidate)

The data tier between Phase 4 callers and Square. Reads `product_cache`; if a row is missing or older than 1 hour, kicks a background refresh and serves stale data immediately.

**Files:**
- Create: `src/lib/products/cache.ts`
- Create: `tests/square/product-cache.test.ts`

- [ ] **Step 7.1: Implement the cache module**

```typescript
// src/lib/products/cache.ts
import 'server-only'
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { productCache, siteSettings } from '@/lib/db/schema'
import { getSquareClient } from '@/lib/square/client'
import {
  getProductById,
  listAllProducts,
  listProductsChangedSince
} from '@/lib/square/catalog'
import type { CachedProduct } from '@/lib/square/types'

const TTL_MS = 60 * 60 * 1000 // 1 hour
const LAST_SYNC_KEY = 'square_last_catalog_sync_at'

/**
 * Returns a product from the cache, refreshing from Square if missing
 * or stale. Stale rows serve immediately while a background refresh runs.
 */
export async function getCachedProduct(catalogItemId: string): Promise<CachedProduct | null> {
  const [row] = await db
    .select()
    .from(productCache)
    .where(eq(productCache.catalogItemId, catalogItemId))

  if (!row) {
    return refreshOne(catalogItemId)
  }

  const ageMs = Date.now() - row.updatedAt.getTime()
  if (ageMs > TTL_MS) {
    // Stale: kick off background refresh but return stale data immediately.
    void refreshOne(catalogItemId).catch((err) =>
      console.error('Background cache refresh failed for', catalogItemId, err)
    )
  }

  return row.data as CachedProduct
}

/**
 * Refreshes a single product by hitting Square, then writes to cache.
 * Returns the fresh CachedProduct (or null if the item was deleted upstream).
 */
export async function refreshOne(catalogItemId: string): Promise<CachedProduct | null> {
  const client = getSquareClient()
  const fresh = await getProductById(client, catalogItemId)
  if (!fresh) {
    await db.delete(productCache).where(eq(productCache.catalogItemId, catalogItemId))
    return null
  }
  await upsertCachedProduct(fresh)
  return fresh
}

/**
 * Full catalog backfill. Used by pnpm square:sync on first boot.
 */
export async function refreshAll(): Promise<{ count: number }> {
  const client = getSquareClient()
  const products = await listAllProducts(client)
  for (const product of products) {
    await upsertCachedProduct(product)
  }
  await setLastSyncAt(new Date().toISOString())
  return { count: products.length }
}

/**
 * Delta sync triggered by the catalog.version.updated webhook.
 * Refreshes everything changed since the last sync timestamp.
 */
export async function refreshChanged(): Promise<{ count: number }> {
  const beginTime = await getLastSyncAt() ?? new Date(Date.now() - TTL_MS).toISOString()
  const client = getSquareClient()
  const products = await listProductsChangedSince(client, beginTime)
  for (const product of products) {
    await upsertCachedProduct(product)
  }
  await setLastSyncAt(new Date().toISOString())
  return { count: products.length }
}

/**
 * Writes (or overwrites) one CachedProduct in the table.
 */
export async function upsertCachedProduct(product: CachedProduct): Promise<void> {
  await db
    .insert(productCache)
    .values({
      catalogItemId: product.id,
      data: product,
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: productCache.catalogItemId,
      set: { data: product, updatedAt: new Date() }
    })
}

/**
 * Pulls multiple cached products at once. No staleness check — caller
 * is responsible for triggering refreshAll/refreshChanged on a schedule.
 * Phase 4 list pages (/shop) use this.
 */
export async function getCachedProducts(catalogItemIds: string[]): Promise<CachedProduct[]> {
  if (catalogItemIds.length === 0) return []
  const rows = await db
    .select()
    .from(productCache)
    .where(inArray(productCache.catalogItemId, catalogItemIds))
  return rows.map((r) => r.data as CachedProduct)
}

// ---------- site_settings helpers for the sync timestamp ----------

async function getLastSyncAt(): Promise<string | null> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, LAST_SYNC_KEY))
  if (!row) return null
  const value = row.value as { iso?: string } | string
  if (typeof value === 'string') return value
  return value.iso ?? null
}

async function setLastSyncAt(iso: string): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key: LAST_SYNC_KEY, value: { iso }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: { iso }, updatedAt: new Date() }
    })
}
```

- [ ] **Step 7.2: Add a unit test that exercises the upsert path with a mocked DB**

The full SWR loop is exercised in integration tests (Task 12). Unit-side, we lock the upsert SQL shape so refactors don't drift.

```typescript
// tests/square/product-cache.test.ts
import { describe, expect, it, vi } from 'vitest'

// Mock the db module BEFORE importing the cache module.
const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn()
}

vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/db/schema', () => ({
  productCache: { catalogItemId: 'catalog_item_id_column' },
  siteSettings: { key: 'key_column' }
}))
vi.mock('@/lib/square/client', () => ({ getSquareClient: () => ({}) }))
vi.mock('@/lib/square/catalog', () => ({
  getProductById: vi.fn(),
  listAllProducts: vi.fn(),
  listProductsChangedSince: vi.fn()
}))

describe('product cache (unit, mocked db)', () => {
  it('upsertCachedProduct calls insert + onConflictDoUpdate', async () => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined)
    }
    dbMock.insert.mockReturnValue(chain)

    const { upsertCachedProduct } = await import('@/lib/products/cache')
    await upsertCachedProduct({
      id: 'sq_test',
      name: 'Test',
      description: null,
      descriptionHtml: null,
      variations: [],
      images: [],
      categoryIds: [],
      customAttributes: {},
      updatedAt: '2026-01-15T10:00:00Z'
    })

    expect(dbMock.insert).toHaveBeenCalledOnce()
    expect(chain.values).toHaveBeenCalledOnce()
    expect(chain.onConflictDoUpdate).toHaveBeenCalledOnce()
    expect(chain.values.mock.calls[0][0]).toMatchObject({ catalogItemId: 'sq_test' })
  })
})
```

This is a narrow lock on the upsert call shape — the integration tests in Task 12 prove the round trip.

- [ ] **Step 7.3: Run tests and typecheck**

```bash
pnpm test tests/square/product-cache.test.ts
pnpm typecheck
```

Expected: 1 passed, typecheck exits 0.

- [ ] **Step 7.4: Lint-fix and commit**

```bash
pnpm lint:fix
git add src/lib/products/cache.ts tests/square/product-cache.test.ts
git commit -m "Task 7: Phase 3 — product cache (stale-while-revalidate)

src/lib/products/cache.ts exposes:
  - getCachedProduct(id)   read-through SWR, 1h TTL
  - refreshOne(id)         force refresh from Square
  - refreshAll()           full backfill (pnpm square:sync)
  - refreshChanged()       delta sync (webhook handler)
  - upsertCachedProduct()  used by all paths above
  - getCachedProducts([])  bulk read for /shop in Phase 4

Last-sync timestamp lives in site_settings under
'square_last_catalog_sync_at' so refreshChanged() can pass
beginTime to Square's searchCatalogObjects."
```

---

## Task 8: pnpm square:sync — initial backfill script

The one-shot script that populates `product_cache` for the first time. Run after Task 5 has created the custom attribute definitions and after staff has uploaded at least one item to the sandbox.

**Files:**
- Create: `scripts/square-sync.ts`
- Modify: `package.json` (add `square:sync` script)

- [ ] **Step 8.1: Write the script**

```typescript
// scripts/square-sync.ts
#!/usr/bin/env tsx
import { refreshAll } from '../src/lib/products/cache'

async function main(): Promise<void> {
  console.log('Starting full Square catalog sync...')
  const result = await refreshAll()
  console.log(`Synced ${result.count} item(s) into product_cache.`)
}

main().catch((err) => {
  console.error('square:sync failed:', err)
  process.exit(1)
})
```

- [ ] **Step 8.2: Register the script**

Add `"square:sync": "tsx scripts/square-sync.ts"` to `package.json` scripts.

- [ ] **Step 8.3: Create a test item in the Square sandbox**

In the Square sandbox dashboard:
1. Items → **Create item**.
2. Name: `Naruto — Acrylic Wall Art` (or whatever).
3. Price: $75.00.
4. Categories: leave default or assign one.
5. Custom attributes (scroll to the bottom):
   - Artist: `bxnny`
   - IP / Franchise: `naruto`
   - Product Type: `acrylic`
   - Sibling Group: leave blank.
6. Save.

- [ ] **Step 8.4: Run the sync**

```bash
set -a
source .env.local
set +a
pnpm square:sync
```

Expected output:
```
Starting full Square catalog sync...
Synced 1 item(s) into product_cache.
```

- [ ] **Step 8.5: Verify the row in Postgres**

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT catalog_item_id, jsonb_pretty(data) FROM product_cache;"
```

Expected: one row. The pretty-printed `data` JSONB contains `name`, `customAttributes: { artist: 'bxnny', ip: 'naruto', product_type: 'acrylic' }`, `images: [...]`, and `variations` (at least one).

- [ ] **Step 8.6: Re-run to verify idempotency**

```bash
pnpm square:sync
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT COUNT(*) FROM product_cache;"
```

Expected: still `1`. The script does upsert, not insert.

- [ ] **Step 8.7: Confirm site_settings tracks the sync timestamp**

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT key, value FROM site_settings WHERE key = 'square_last_catalog_sync_at';"
```

Expected: one row with `value` containing `{"iso": "2026-..."}`.

- [ ] **Step 8.8: Lint-fix and commit**

```bash
pnpm lint:fix
git add scripts/square-sync.ts package.json
git commit -m "Task 8: Phase 3 — pnpm square:sync backfill script

One-shot script that calls refreshAll() — pulls every ITEM from
the configured Square catalog, denormalizes with images, and
upserts into product_cache. Records the sync timestamp in
site_settings so the webhook handler's delta sync has a starting
point.

Idempotent: re-running upserts rather than duplicating."
```

---

## Task 9: Webhook signature verification

Wrap `WebhooksHelper.verifySignature` into a request-shaped helper that's easy to call from the App Router route handler.

**Files:**
- Create: `src/lib/square/webhook-signature.ts`
- Create: `tests/square/webhook-signature.test.ts`

- [ ] **Step 9.1: Write the helper**

```typescript
// src/lib/square/webhook-signature.ts
import 'server-only'
import { WebhooksHelper } from 'square'
import { env } from '@/lib/env'

/**
 * Verifies a Square webhook request. Returns true if the signature is valid.
 *
 * @param rawBody  the request body EXACTLY as Square sent it (no JSON.parse).
 * @param signatureHeader  value of the `x-square-hmacsha256-signature` header.
 * @param notificationUrl  the public URL that the webhook subscription
 *                          targets. Must match exactly (including https://,
 *                          path, no trailing slash).
 */
export async function verifySquareWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  notificationUrl: string
): Promise<boolean> {
  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    throw new Error(
      'SQUARE_WEBHOOK_SIGNATURE_KEY is not set. Configure the webhook subscription first.'
    )
  }
  return WebhooksHelper.verifySignature({
    requestBody: rawBody,
    signatureHeader,
    signatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    notificationUrl
  })
}
```

- [ ] **Step 9.2: Write the unit test**

```typescript
// tests/square/webhook-signature.test.ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('square', () => ({
  WebhooksHelper: {
    verifySignature: vi.fn()
  }
}))

describe('verifySquareWebhookSignature', () => {
  it('throws when SQUARE_WEBHOOK_SIGNATURE_KEY is unset', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_WEBHOOK_SIGNATURE_KEY', undefined)
    vi.resetModules()
    const mod = await import('@/lib/square/webhook-signature')
    await expect(
      mod.verifySquareWebhookSignature('body', 'sig', 'https://example.test/wh')
    ).rejects.toThrow(/SQUARE_WEBHOOK_SIGNATURE_KEY is not set/)
    vi.unstubAllEnvs()
  })

  it('delegates to WebhooksHelper.verifySignature with the right args', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_WEBHOOK_SIGNATURE_KEY', 'test_key_xyz')
    vi.resetModules()
    const { WebhooksHelper } = await import('square')
    vi.mocked(WebhooksHelper.verifySignature).mockResolvedValue(true)

    const mod = await import('@/lib/square/webhook-signature')
    const result = await mod.verifySquareWebhookSignature(
      '{"hello":"world"}',
      'sigvalue',
      'https://example.test/api/webhooks/square'
    )

    expect(result).toBe(true)
    expect(WebhooksHelper.verifySignature).toHaveBeenCalledWith({
      requestBody: '{"hello":"world"}',
      signatureHeader: 'sigvalue',
      signatureKey: 'test_key_xyz',
      notificationUrl: 'https://example.test/api/webhooks/square'
    })
    vi.unstubAllEnvs()
  })

  it('returns false when WebhooksHelper rejects the signature', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5433/db')
    vi.stubEnv('SQUARE_WEBHOOK_SIGNATURE_KEY', 'test_key_xyz')
    vi.resetModules()
    const { WebhooksHelper } = await import('square')
    vi.mocked(WebhooksHelper.verifySignature).mockResolvedValue(false)

    const mod = await import('@/lib/square/webhook-signature')
    const result = await mod.verifySquareWebhookSignature(
      'bad-body',
      'bad-sig',
      'https://example.test/api/webhooks/square'
    )
    expect(result).toBe(false)
    vi.unstubAllEnvs()
  })
})
```

- [ ] **Step 9.3: Run tests**

```bash
pnpm test tests/square/webhook-signature.test.ts
```

Expected: 3 passed.

- [ ] **Step 9.4: Lint-fix and commit**

```bash
pnpm lint:fix
git add src/lib/square/webhook-signature.ts tests/square/webhook-signature.test.ts
git commit -m "Task 9: Phase 3 — webhook signature verification

Thin wrapper over square's WebhooksHelper.verifySignature that
hard-fails if SQUARE_WEBHOOK_SIGNATURE_KEY is unset. Unit tests
cover missing-key, success path argument passing, and rejection."
```

---

## Task 10: Webhook route handler

The actual `POST /api/webhooks/square` endpoint. Verifies the signature, routes the event, writes to `order_log`, triggers cache refresh on catalog events. Returns 200 quickly (Square retries on non-2xx).

**Files:**
- Create: `src/app/api/webhooks/square/route.ts`

- [ ] **Step 10.1: Write the route handler**

```typescript
// src/app/api/webhooks/square/route.ts
import { db } from '@/lib/db/client'
import { orderLog } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { refreshChanged } from '@/lib/products/cache'
import { verifySquareWebhookSignature } from '@/lib/square/webhook-signature'
import { NextResponse } from 'next/server'

/**
 * Square webhook events we handle. See spec §18.
 *
 * catalog.version.updated   → trigger delta cache refresh
 * order.created             → audit log
 * order.updated             → audit log
 * order.fulfillment.updated → audit log
 * payment.created           → audit log (notifications wired in Phase 9)
 *
 * Anything else is logged with type='unknown.event' so future Square event
 * types don't get silently dropped — we'd rather store them for forensics.
 */

interface SquareWebhookPayload {
  type: string
  event_id: string
  merchant_id: string
  data?: {
    type?: string
    id?: string
    object?: unknown
  }
}

export async function POST(request: Request): Promise<Response> {
  // 1. Read the raw body. NextRequest exposes .text() for the unparsed string;
  //    we need that exact string for signature verification.
  const rawBody = await request.text()
  const signature = request.headers.get('x-square-hmacsha256-signature') ?? ''
  const notificationUrl = `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/square`

  // 2. Verify the signature. If invalid, return 403.
  let valid = false
  try {
    valid = await verifySquareWebhookSignature(rawBody, signature, notificationUrl)
  } catch (err) {
    console.error('Square webhook signature verification threw:', err)
    return NextResponse.json({ error: 'verification_failure' }, { status: 500 })
  }
  if (!valid) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
  }

  // 3. Parse the payload AFTER signature verification (defense in depth — never
  //    trust a payload until you've verified it).
  let payload: SquareWebhookPayload
  try {
    payload = JSON.parse(rawBody) as SquareWebhookPayload
  } catch (err) {
    console.error('Square webhook body is not valid JSON:', err)
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // 4. Route by event type. All paths write to order_log first (audit),
  //    then optionally trigger side effects.
  const squareOrderId = extractOrderId(payload)

  try {
    await db.insert(orderLog).values({
      squareOrderId: squareOrderId ?? `event_${payload.event_id}`,
      eventType: payload.type,
      payload
    })

    if (payload.type === 'catalog.version.updated') {
      // Fire-and-forget; we don't want webhook latency to depend on Square's
      // catalog response. Errors get logged but don't fail the webhook.
      void refreshChanged().catch((err) =>
        console.error('catalog.version.updated refreshChanged failed:', err)
      )
    }

    // Phase 9 will hook payment.created here to fire Discord + SMS. For now,
    // the audit log row is enough.
  } catch (err) {
    console.error('Square webhook processing failed:', err)
    // Still return 200 — Square retries non-2xx, but we've already verified
    // the signature, and the audit row failure is our problem to debug,
    // not Square's to retry forever. Surface in /admin/diagnostics in Phase 12.
    return NextResponse.json({ ok: true, warning: 'processing_failed' }, { status: 200 })
  }

  return NextResponse.json({ ok: true })
}

function extractOrderId(payload: SquareWebhookPayload): string | null {
  // For order.* events, data.id is the order id. For payment.* events,
  // data.object.payment.order_id is. For catalog events, no order id exists.
  if (!payload.data) return null
  if (payload.type.startsWith('order.')) {
    return payload.data.id ?? null
  }
  if (payload.type === 'payment.created') {
    const obj = payload.data.object as
      | { payment?: { order_id?: string } }
      | undefined
    return obj?.payment?.order_id ?? null
  }
  return null
}
```

Note: The route is a server module imported via Next.js's route handler convention. `'server-only'` is not needed in route files (App Router routes are server-only by definition). The signature-check happens before JSON.parse so we don't burn cycles on unauthenticated payloads.

- [ ] **Step 10.2: Sanity-check the build**

```bash
pnpm typecheck
pnpm build
```

Expected: typecheck clean. Build succeeds; the route appears under `.next/server/app/api/webhooks/square/route.js`.

- [ ] **Step 10.3: Lint-fix and commit**

```bash
pnpm lint:fix
git add src/app/api/webhooks/square/route.ts
git commit -m "Task 10: Phase 3 — POST /api/webhooks/square handler

Reads raw body, verifies HMAC-SHA256 signature via Square's
WebhooksHelper, parses JSON, writes one audit row to order_log,
and fires refreshChanged() on catalog.version.updated.

Returns 403 for bad signature, 400 for invalid JSON, 200 for
everything else (including failed downstream processing — Square's
retry semantics are not the right mechanism to recover from our
own audit-row insert failures; that's a diagnostics problem)."
```

---

## Task 11: Local dev tunnel + webhook subscription setup

For Square sandbox webhooks to reach `localhost:3000`, we need a public HTTPS tunnel. Document the cloudflared workflow and walk the user through subscribing in the dashboard.

**Files:**
- Modify: `docs/superpowers/specs/reference/square-sandbox-setup.md` (already started in Task 4; Task 11 fills out the webhook section)
- Modify: `README.md` (cross-link the tunnel doc)

- [ ] **Step 11.1: Pick a tunnel tool**

Use `cloudflared` (free, no account required for `cloudflared tunnel --url`). Alternative: ngrok (requires account for stable URLs). The doc shows cloudflared.

If the user doesn't have cloudflared:
```bash
# macOS
brew install cloudflared
# Linux
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

- [ ] **Step 11.2: Start the tunnel**

```bash
cloudflared tunnel --url http://localhost:3000
```

Output includes a line like:
```
2026-... INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
2026-... INF |  https://animeniacs-dev-abc123.trycloudflare.com
```

The user copies that URL.

- [ ] **Step 11.3: Walk through the Square dashboard webhook subscription**

In Square Sandbox dashboard → application → Sandbox → **Webhooks** → **+ Add subscription**:

- Notification URL: `https://<tunnel-host>/api/webhooks/square`
- API version: match what the SDK pins (visible in `node_modules/square/package.json` → check the actual version the SDK targets, or inspect by calling `client.someApi.someMethod()` once)
- Events:
  - `catalog.version.updated`
  - `order.created`
  - `order.updated`
  - `order.fulfillment.updated`
  - `payment.created`

Save → reveal the Signature Key → paste into `.env.local` as `SQUARE_WEBHOOK_SIGNATURE_KEY`.

- [ ] **Step 11.4: Restart the app to pick up the new env var**

```bash
docker compose --env-file .env.local up -d --build app
```

- [ ] **Step 11.5: Send a test event**

In the webhook subscription detail page, click **Send Test Event** → choose `catalog.version.updated` → Send.

Verify in the app logs (`docker compose logs -f app`) that the request landed with a 200. Then check Postgres:

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT event_type, received_at FROM order_log ORDER BY received_at DESC LIMIT 5;"
```

Expected: a row with `event_type = 'catalog.version.updated'`.

- [ ] **Step 11.6: Update README cross-link**

Add a one-line link under the existing docs section in `README.md`:

```markdown
- [Square sandbox setup](./docs/superpowers/specs/reference/square-sandbox-setup.md) — credentials, webhook subscription, and tunnel.
```

- [ ] **Step 11.7: Commit**

The Task 4 doc was committed already. Task 11 doesn't add a new file — it walks the user through manual dashboard steps and updates README.

```bash
pnpm lint:fix
git add README.md
git commit -m "Task 11: Phase 3 — link Square sandbox setup doc from README"
```

The webhook subscription itself is dashboard-side and not git-tracked.

---

## Task 12: Square integration tests against the live sandbox

Now that the SDK is wired, the catalog reads work, and the webhook receives events, prove the full round trip with real sandbox HTTP calls.

**Files:**
- Create: `tests/integration/square/README.md`
- Create: `tests/integration/square/catalog-read.integration.test.ts`
- Create: `tests/integration/square/product-cache.integration.test.ts`
- Modify: `vitest.integration.config.ts` (extend include glob if needed — it already covers `tests/integration/**/*.integration.test.ts`)

- [ ] **Step 12.1: Write the integration README**

```markdown
# Square integration tests

These tests hit the real Square Sandbox API. They require:

- `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID` set in `.env.local`
  (loaded automatically by vitest.integration.config.ts).
- A working Postgres container at `localhost:5433`.
- At least one test item in the sandbox catalog. The square:sync script
  populates product_cache before these tests run; if your sandbox is
  empty, create an item first.

These tests live under `tests/integration/square/`. They run as part of
`pnpm test:integration` along with all the DB integration tests; no
separate command needed.

If you don't have Square keys set, the tests in this directory will skip
(see the describe.skipIf condition at the top of each file).
```

- [ ] **Step 12.2: Write the catalog-read integration test**

```typescript
// tests/integration/square/catalog-read.integration.test.ts
import { describe, expect, it } from 'vitest'
import { getSquareClient } from '@/lib/square/client'
import { listAllProducts } from '@/lib/square/catalog'

const HAS_KEYS = Boolean(process.env.SQUARE_ACCESS_TOKEN)

describe.skipIf(!HAS_KEYS)('Square catalog read (sandbox)', () => {
  it('lists at least one ITEM from the sandbox', async () => {
    const client = getSquareClient()
    const products = await listAllProducts(client)
    expect(products.length).toBeGreaterThan(0)
  })

  it('each product has a non-empty name and a stable id', async () => {
    const client = getSquareClient()
    const products = await listAllProducts(client)
    for (const p of products) {
      expect(p.id).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('reads custom attributes when set', async () => {
    const client = getSquareClient()
    const products = await listAllProducts(client)
    // Find the test item we created in Task 8 (or any item with attrs set).
    const withArtist = products.find((p) => p.customAttributes.artist)
    if (!withArtist) {
      // No test item has artist set; the assertion below would fail.
      // Skip with a clear message rather than failing.
      console.warn(
        'No sandbox item has a custom artist attribute. Add one via the dashboard to exercise this test.'
      )
      return
    }
    expect(withArtist.customAttributes.artist).toBeTruthy()
  })
})
```

- [ ] **Step 12.3: Write the product-cache integration test**

```typescript
// tests/integration/square/product-cache.integration.test.ts
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { productCache } from '@/lib/db/schema'
import { getCachedProduct, refreshAll } from '@/lib/products/cache'
import { cleanupByPrefix, testNamespace } from '../../helpers/db'

const HAS_KEYS = Boolean(process.env.SQUARE_ACCESS_TOKEN)
const NS = testNamespace('sq-pc')

describe.skipIf(!HAS_KEYS)('product cache <-> Square (sandbox)', () => {
  it('refreshAll populates product_cache with at least one row', async () => {
    const result = await refreshAll()
    expect(result.count).toBeGreaterThan(0)
    const rows = await db.select().from(productCache)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('getCachedProduct returns the row that was just synced', async () => {
    const rows = await db.select().from(productCache)
    if (rows.length === 0) {
      console.warn('product_cache is empty; run pnpm square:sync first')
      return
    }
    const target = rows[0]
    const result = await getCachedProduct(target.catalogItemId)
    expect(result).not.toBeNull()
    expect(result?.id).toBe(target.catalogItemId)
  })

  afterAll(async () => {
    // We don't pollute product_cache from these tests (the refreshAll path
    // writes real sandbox data, not NS-tagged), so cleanupByPrefix is a
    // no-op here. Kept for parity with the rest of the integration suite.
    await cleanupByPrefix(productCache, 'catalog_item_id', NS)
  })
})
```

Note: these tests intentionally use real Square data rather than NS-prefixed test rows. The `product_cache` table can hold real data alongside zero-impact test reads. `cleanupByPrefix` is included for consistency but matches nothing.

- [ ] **Step 12.4: Run the integration suite**

```bash
pnpm test:integration
```

Expected: previous integration tests still pass (~28), new Square ones pass (~5 additional asserts), grand total around 33+.

- [ ] **Step 12.5: Lint-fix and commit**

```bash
pnpm lint:fix
git add tests/integration/square/
git commit -m "Task 12: Phase 3 — Square integration tests

Hit the live sandbox to verify the end-to-end pipeline:

  - listAllProducts() returns at least one ITEM
  - Every ITEM has a non-empty name + stable id + ISO updatedAt
  - Custom attributes round-trip when set in the dashboard
  - refreshAll() writes to product_cache
  - getCachedProduct() returns rows that refreshAll() just wrote

Tests describe.skipIf(!HAS_KEYS) so they're invisible to anyone
running the integration suite without Square keys. Documented in
tests/integration/square/README.md."
```

---

## Task 13: End-to-end manual verification + tag

Final sanity pass. Spin everything, send a real test webhook, prove the cache refreshes.

- [ ] **Step 13.1: Confirm services are healthy**

```bash
docker compose ps
```

Expected: postgres, app, logto, plausible, plausible-clickhouse all `Up`.

- [ ] **Step 13.2: Confirm sandbox keys still work**

```bash
source .env.local
curl -sS https://connect.squareupsandbox.com/v2/locations \
  -H "Authorization: Bearer $SQUARE_ACCESS_TOKEN" \
  -H "Square-Version: 2025-04-16" | head
```

Expected: JSON with `locations` array.

- [ ] **Step 13.3: Confirm setup ran cleanly**

```bash
pnpm square:setup
```

Expected: all 4 definitions are "Skipped" on this re-run.

- [ ] **Step 13.4: Confirm catalog is in sync**

```bash
pnpm square:sync
```

Expected: at least one item synced (the one from Task 8 step 8.3).

- [ ] **Step 13.5: Make a catalog change in the sandbox dashboard**

In Square Sandbox dashboard → edit the test item from Task 8 → change the price (e.g., $75 → $80) → Save.

This fires the `catalog.version.updated` webhook to the tunnel URL → app route handler → `refreshChanged()` → upserts the row in `product_cache`.

- [ ] **Step 13.6: Verify the webhook landed**

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT event_type, received_at FROM order_log ORDER BY received_at DESC LIMIT 5;"
```

Expected: at least one `catalog.version.updated` row with a `received_at` from the last minute.

- [ ] **Step 13.7: Verify the cache caught the price change**

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT catalog_item_id, data->'variations'->0->'price' FROM product_cache;"
```

Expected: the variation price reflects the new value (8000 cents for $80, where it was 7500 before).

- [ ] **Step 13.8: Send a manual order test event from the dashboard**

In the Square sandbox webhooks subscription detail page → **Send Test Event** → `order.created`.

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT event_type, payload->'data'->>'id' AS order_id, received_at \
      FROM order_log ORDER BY received_at DESC LIMIT 3;"
```

Expected: an `order.created` row with the test order ID.

- [ ] **Step 13.9: Run the full automated suite one more time**

```bash
pnpm test
pnpm test:integration
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all green. Unit count ~21, integration count 33+.

- [ ] **Step 13.10: Tag Phase 3 complete**

```bash
git tag -a phase-3-square-catalog -m "Phase 3 complete: Square Catalog integration"
git log --oneline | head -20
```

---

## Phase 3 self-review

- [ ] **Spec coverage**
  - §3 (Square Catalog as source of truth, custom attributes) → Tasks 1, 5 ✓
  - §3 (image denormalization with batch fetch) → Task 6 ✓
  - §3 (`product_cache` TTL 1h, refreshed on webhook) → Task 7 ✓
  - §18 (Square webhooks: catalog.version.updated, order.created, order.updated, order.fulfillment.updated, payment.created) → Tasks 9, 10 ✓
  - §18 (HMAC signature verification) → Task 9 ✓
  - §11 (custom attribute appearance in Square Dashboard) → Task 5 + manual verify Step 5.5 ✓

- [ ] **Placeholder scan**
  - No TBD / TODO / FIXME left.
  - Square SDK method-name flexibility called out explicitly where the SDK shape might differ from documented examples (Task 5 note, Task 6 note). The subagent adapts to the installed SDK without changing test contracts.

- [ ] **Type consistency**
  - `CachedProduct`, `CachedVariation`, `CachedMoney`, `CustomAttrKey`, `ProductType` are defined once in `src/lib/square/types.ts` and imported everywhere.
  - `CUSTOM_ATTR_KEYS` is used in both `types.ts` and `custom-attributes.ts` to source the same key strings — no duplicated string literals.

- [ ] **Lessons-applied check**
  - Every commit step runs `pnpm lint:fix` before `git add` ✓
  - No `text({ enum })` reliance for new constraints (no new tables added; existing constraints stay as-is) ✓
  - `vi.stubEnv` uses `undefined` to unset everywhere ✓
  - `pnpm db:push --force` with explicit `DATABASE_URL=...:5433/...` — N/A, Phase 3 doesn't touch the DB schema, but the convention is documented at top so it doesn't get forgotten in Phase 4+

---

## Outcome

After Phase 3 ships:

- `square@^44` SDK is wired with a tested singleton client.
- The four custom-attribute definitions exist in your Square sandbox; staff can edit Artist / IP / Product Type / Sibling Group in the dashboard item editor.
- `pnpm square:sync` backfills the catalog.
- `POST /api/webhooks/square` accepts signature-verified Square events, audits every one to `order_log`, and triggers `refreshChanged()` on catalog mutations.
- Real sandbox catalog changes propagate to `product_cache` within seconds.
- Test counts: 21 unit, ~33 integration, plus 5 Square-sandbox integration tests behind `describe.skipIf(!HAS_KEYS)`.

Phase 4 (catalog UX) opens by reading `product_cache` directly — no SDK calls from React server components.
