# Phase 7 — Checkout + webhook + notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full payment loop: cart Checkout button → POST `/api/checkout` (Square Order + Payment Link + abandoned_carts row) → redirect to Square hosted checkout → return to `/checkout/success` → webhook fan-out (Discord + SMS notifications) on `payment.created`. Plus `/admin/sms-recipients` CRUD for the notification recipient list.

**Architecture:** First Square-write phase. `/api/checkout` validates cart prices against live Square via Phase 5's `getProductById`, rejects with 409 on price drift > 1¢, creates Order via `client.orders.create`, persists `abandoned_carts` row, then creates Payment Link via `client.checkout.paymentLinks.create`, returns hosted URL for client redirect. `/api/webhooks/square` HMAC-SHA256-verifies Square's signature, idempotency-checks via `event_id`, appends to `order_log`, fans out Discord webhook + SMS via the existing `sms-edge` HTTP API for each enabled recipient. All Square writes go to `SQUARE_ENV=sandbox` until operator flips the env flag for prod cutover.

**Tech Stack:** Next.js 14 App Router, Square SDK v44, Drizzle ORM + postgres-js, Zod, vitest + RTL. No new npm deps.

**Predecessor:** `docs/superpowers/specs/reference/phase-06-handoff.md` (tag `phase-6-cart` at `069d42c`).
**Spec:** `docs/superpowers/specs/2026-05-26-phase-07-checkout-design.md` (commit `16dedea`).

---

## Operator pre-flight checklist (run BEFORE starting Phase 7 execution)

Phase 7 is the first phase that needs operator credentials beyond what Phases 1-6 already set. **Do these three steps before kicking off execution:**

1. **Square sandbox webhook subscription:**
   - Square sandbox dashboard → your app → Webhooks → Add Subscription.
   - URL: `https://dev.animeniacs.shop/api/webhooks/square` (the URL Square will POST to — must match a deployed environment).
   - Subscribe events: `payment.created`, `order.fulfillment.updated`, `refund.created`.
   - Copy the **Signature Key** (one-time visible).
   - Set in `.env.local`: `SQUARE_WEBHOOK_SIGNATURE_KEY=<key>`.
   - Also set in Coolify env for the `dev.animeniacs.shop` deployment.

2. **Discord webhook:**
   - Pick the Discord channel that should receive order notifications.
   - Channel → Edit Channel → Integrations → Webhooks → New Webhook.
   - Copy URL.
   - Set in `.env.local`: `DISCORD_ORDER_WEBHOOK_URL=<url>`.
   - Also set in Coolify env.

3. **sms-edge credentials:**
   - Reuse credentials from an existing project that calls `sms-edge` (Smile NOLA / Court Command per Phase 4 handoff).
   - Set in `.env.local`:
     ```
     SMSGATE_USER=<user>
     SMSGATE_PASS=<pass>
     SMSGATE_BASE_URL=https://sms.relentnet.dev
     ```
   - Also set in Coolify env.

If any of these are not set when execution starts, the execution agent will hit them as it goes and surface to operator. Doing them up-front saves cycles.

---

## Baseline (run BEFORE starting any task)

```sh
cd ~/code/animeniacs-shop
git describe --tags --abbrev=0   # → phase-6-cart
git rev-parse --short HEAD       # → 16dedea or descendant (spec commit)
pnpm lint && pnpm typecheck
pnpm test                        # baseline: 191/191 passing
pnpm test:integration            # baseline: 55/55 passing
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs -c "SELECT count(*) FROM artists WHERE status='active';"
# → 15
grep -rn "goaffpro\|GoAffPro" src/ tests/
# → zero hits
```

If any fail, STOP. Do not start Phase 7 on a broken baseline.

---

## Hard constraints (still in force from Phase 4)

1. **No GoAffPro at runtime.** Spec §9 of the master design doc references GoAffPro in the checkout flow — IGNORE those references. Do not import GoAffPro packages, do not add affiliate query params, do not write commission rows.
2. **No `artist` Square custom attribute definition.**
3. **No new auth vendors.**
4. **No commission engine.**
5. **No additional Postgres tables for affiliate / commission tracking.** Phase 7 adds zero tables (uses `abandoned_carts`, `order_log`, `sms_recipients` from Phase 2). One column added to `order_log` (`event_id text` nullable, indexed).
6. **Sandbox-first.** Every Square write defaults to `SQUARE_ENV=sandbox`. Plan does not configure prod.
7. **IP-leak regression tests stay green.**

---

## Execution philosophy

Less micro-stepped than Phase 5 (continuing the Phase 6 approach). Each task ships a complete unit of work with TDD shape (failing test → run-fail → implement → run-pass → commit). Small judgment calls (CSS class names, error message wording, intra-component refactors) left to the implementer when the spec's contracts and the tests' assertions are met. Spec at `docs/superpowers/specs/2026-05-26-phase-07-checkout-design.md` is source of truth.

---

## Dependency graph

```
A (DB queries + migration) ──┐
                             ├──► C (webhook + notifications) ──┐
B (checkout modules)       ──┤                                  │
                             │                                  ├──► D (API routes) ──► E (drawer + success page)
                             │                                  │
A ───────────────────────────┴──► F (sms-recipients admin) ─────┘
                                                                │
                                                                ▼
                                                          G (final gate + tag)
```

A and B are independent. F depends on A. C depends on A. D depends on A + B + C. E depends on D. G gates everything.

Subagent-driven mode: A, B, F can be parallel. C waits for A. D waits for A + B + C. E waits for D.

Inline mode: A → B → C → F → D → E → G works fine in document order.

---

## File structure overview

| Group | Status | File | Approx LOC |
|---|---|---|---|
| A | New | `drizzle/migrations/0011_<random>_add_event_id_to_order_log.sql` | auto-gen |
| A | Modify | `src/lib/db/schema.ts` (append `eventId` column on `order_log`) | +5 |
| A | New | `src/lib/db/queries/abandoned-carts.ts` | ~90 |
| A | New | `src/lib/db/queries/order-log.ts` | ~70 |
| A | New | `src/lib/db/queries/sms-recipients.ts` | ~130 |
| A | New | `tests/integration/abandoned-carts.integration.test.ts` | ~150 |
| A | New | `tests/integration/order-log.integration.test.ts` | ~100 |
| A | New | `tests/integration/sms-recipients.integration.test.ts` | ~160 |
| B | New | `src/lib/checkout/validate-cart.ts` | ~80 |
| B | New | `src/lib/checkout/create-order.ts` | ~70 |
| B | New | `src/lib/checkout/create-payment-link.ts` | ~50 |
| B | New | `tests/checkout/validate-cart.test.ts` | ~150 |
| B | New | `tests/checkout/create-order.test.ts` | ~110 |
| B | New | `tests/checkout/create-payment-link.test.ts` | ~80 |
| C | New | `src/lib/webhooks/verify-signature.ts` | ~50 |
| C | New | `src/lib/webhooks/handle-event.ts` | ~120 |
| C | New | `src/lib/notifications/discord.ts` | ~60 |
| C | New | `src/lib/notifications/sms.ts` | ~100 |
| C | New | `tests/webhooks/verify-signature.test.ts` | ~100 |
| C | New | `tests/webhooks/handle-event.test.ts` | ~180 |
| C | New | `tests/notifications/discord.test.ts` | ~80 |
| C | New | `tests/notifications/sms.test.ts` | ~120 |
| D | New | `src/app/api/checkout/route.ts` | ~90 |
| D | New | `src/app/api/webhooks/square/route.ts` | ~80 |
| D | New | `tests/api/checkout.test.ts` | ~200 |
| D | New | `tests/api/webhooks-square.test.ts` | ~250 |
| E | Modify | `src/components/cart/CartDrawer.tsx` (Checkout button) | ~60 net |
| E | Modify | `src/lib/site-copy.ts` (drop `DISABLED_CHECKOUT_TOOLTIP`) | -3 |
| E | Modify | `tests/cart/cart-drawer.test.tsx` (rewrite checkout-button cases) | varies |
| E | New | `src/app/checkout/success/page.tsx` | ~110 |
| E | New | `src/app/checkout/success/loading.tsx` | ~25 |
| E | New | `src/app/checkout/success/error.tsx` | ~30 |
| E | New | `tests/public/checkout-success-page.test.tsx` | ~140 |
| F | New | `src/app/(admin)/admin/sms-recipients/page.tsx` | ~90 |
| F | New | `src/app/(admin)/admin/sms-recipients/new/page.tsx` | ~20 |
| F | New | `src/app/(admin)/admin/sms-recipients/new/actions.ts` | ~50 |
| F | New | `src/app/(admin)/admin/sms-recipients/[id]/page.tsx` | ~40 |
| F | New | `src/app/(admin)/admin/sms-recipients/[id]/actions.ts` | ~60 |
| F | New | `src/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm.tsx` | ~150 |
| F | New | `src/app/(admin)/admin/sms-recipients/_components/formData.ts` | ~40 |
| F | New | `src/app/(admin)/admin/sms-recipients/_components/validation.ts` | ~50 |
| F | New | `tests/admin/sms-recipients-actions.test.ts` | ~160 |
| All | Modify | `src/lib/env.ts` (add env vars) | +30 |

Migration created via `pnpm db:generate` after Task A.1 schema edit.

---

## Task Group A — DB queries + migration

Three new query-helper modules and one schema column addition. All operate against the existing Phase 2 tables — no new tables.

### Task A.1: Add `eventId` column to `order_log` schema

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Edit `src/lib/db/schema.ts` — find the `orderLog` table definition and add `eventId`**

Existing (Phase 2):
```ts
export const orderLog = pgTable('order_log', {
  id: serial('id').primaryKey(),
  squareOrderId: text('square_order_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow()
})
```

Edit to:
```ts
export const orderLog = pgTable(
  'order_log',
  {
    id: serial('id').primaryKey(),
    squareOrderId: text('square_order_id').notNull(),
    eventType: text('event_type').notNull(),
    /** Square event_id from the webhook payload. Used for idempotency
     *  in the webhook handler — duplicate events get logged but skip
     *  notification fanout. Nullable so backfilled rows (none yet) and
     *  any future non-webhook log writes don't violate. */
    eventId: text('event_id'),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    eventIdIdx: index('order_log_event_id_idx').on(table.eventId)
  })
)
```

Note: `index` must be added to the existing import from `drizzle-orm/pg-core` if not already imported.

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: a new file at `drizzle/migrations/0011_<random>_*.sql` adding the column + index. Inspect it.

- [ ] **Step 3: Apply migration**

Run: `pnpm db:migrate`
Expected: clean output, column + index visible:
```sh
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs -c "\d order_log"
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0011_*.sql drizzle/meta/
git commit -m "Phase 7/A: add nullable event_id column + index to order_log (idempotency support)"
```

### Task A.2: abandoned-carts query helpers + integration tests

**Files:**
- Create: `tests/integration/abandoned-carts.integration.test.ts`
- Create: `src/lib/db/queries/abandoned-carts.ts`

- [ ] **Step 1: Create the failing integration test**

```ts
// tests/integration/abandoned-carts.integration.test.ts
import { db } from '@/lib/db/client'
import {
  createPendingCart,
  getCartBySquareOrderId,
  markCartAbandoned,
  markCartCompleted
} from '@/lib/db/queries/abandoned-carts'
import { abandonedCarts } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { testNamespace } from '../helpers/db'

const NS = testNamespace('abancarts')

function fixture(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    cartId: `${NS}_cart_${suffix}`,
    squareOrderId: `${NS}_order_${suffix}`,
    cartSnapshot: { items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1 }] },
    buyerEmail: null,
    ...overrides
  }
}

afterAll(async () => {
  await db.delete(abandonedCarts).where(sql`${abandonedCarts.cartId} LIKE ${`${NS}%`}`)
})

describe('abandoned_carts query helpers', () => {
  it('createPendingCart inserts a row with status=pending', async () => {
    const row = await createPendingCart(fixture('create'))
    expect(row.cartId).toBe(`${NS}_cart_create`)
    expect(row.status).toBe('pending')
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it('getCartBySquareOrderId returns the row', async () => {
    await createPendingCart(fixture('lookup'))
    const found = await getCartBySquareOrderId(`${NS}_order_lookup`)
    expect(found?.cartId).toBe(`${NS}_cart_lookup`)
  })

  it('getCartBySquareOrderId returns undefined when missing', async () => {
    expect(await getCartBySquareOrderId(`${NS}_order_missing`)).toBeUndefined()
  })

  it('markCartCompleted flips status from pending', async () => {
    await createPendingCart(fixture('complete'))
    await markCartCompleted(`${NS}_order_complete`)
    const row = await getCartBySquareOrderId(`${NS}_order_complete`)
    expect(row?.status).toBe('completed')
  })

  it('markCartCompleted is idempotent', async () => {
    await createPendingCart(fixture('idempotent'))
    await markCartCompleted(`${NS}_order_idempotent`)
    await markCartCompleted(`${NS}_order_idempotent`)
    const row = await getCartBySquareOrderId(`${NS}_order_idempotent`)
    expect(row?.status).toBe('completed')
  })

  it('markCartCompleted on missing row does not throw', async () => {
    await expect(markCartCompleted(`${NS}_order_nope`)).resolves.not.toThrow()
  })

  it('markCartAbandoned flips status to abandoned', async () => {
    await createPendingCart(fixture('abandoned'))
    await markCartAbandoned(`${NS}_order_abandoned`)
    const row = await getCartBySquareOrderId(`${NS}_order_abandoned`)
    expect(row?.status).toBe('abandoned')
  })

  it('updatedAt bumps on status change', async () => {
    await createPendingCart(fixture('updated'))
    const before = await getCartBySquareOrderId(`${NS}_order_updated`)
    await new Promise((r) => setTimeout(r, 10))
    await markCartCompleted(`${NS}_order_updated`)
    const after = await getCartBySquareOrderId(`${NS}_order_updated`)
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime())
  })
})
```

- [ ] **Step 2: Run — should fail (module doesn't exist)**

Run: `pnpm test:integration tests/integration/abandoned-carts.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/db/queries/abandoned-carts.ts`**

```ts
import 'server-only'
import { db } from '@/lib/db/client'
import { type AbandonedCart, abandonedCarts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface CreatePendingCartInput {
  cartId: string
  squareOrderId: string
  cartSnapshot: unknown
  buyerEmail: string | null
}

export async function createPendingCart(input: CreatePendingCartInput): Promise<AbandonedCart> {
  const [row] = await db
    .insert(abandonedCarts)
    .values({
      cartId: input.cartId,
      squareOrderId: input.squareOrderId,
      cartSnapshot: input.cartSnapshot,
      buyerEmail: input.buyerEmail,
      status: 'pending'
    })
    .returning()
  return row
}

export async function getCartBySquareOrderId(
  squareOrderId: string
): Promise<AbandonedCart | undefined> {
  const rows = await db
    .select()
    .from(abandonedCarts)
    .where(eq(abandonedCarts.squareOrderId, squareOrderId))
    .limit(1)
  return rows[0]
}

export async function markCartCompleted(squareOrderId: string): Promise<void> {
  await db
    .update(abandonedCarts)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(abandonedCarts.squareOrderId, squareOrderId))
}

export async function markCartAbandoned(squareOrderId: string): Promise<void> {
  await db
    .update(abandonedCarts)
    .set({ status: 'abandoned', updatedAt: new Date() })
    .where(eq(abandonedCarts.squareOrderId, squareOrderId))
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:integration tests/integration/abandoned-carts.integration.test.ts`
Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/abandoned-carts.ts tests/integration/abandoned-carts.integration.test.ts
git commit -m "Phase 7/A: abandoned_carts query helpers + integration tests"
```

### Task A.3: order-log query helpers + integration tests

**Files:**
- Create: `tests/integration/order-log.integration.test.ts`
- Create: `src/lib/db/queries/order-log.ts`

- [ ] **Step 1: Create the failing integration test**

```ts
import { db } from '@/lib/db/client'
import { appendOrderLog, hasEventId } from '@/lib/db/queries/order-log'
import { orderLog } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { testNamespace } from '../helpers/db'

const NS = testNamespace('orderlog')

afterAll(async () => {
  await db.delete(orderLog).where(sql`${orderLog.squareOrderId} LIKE ${`${NS}%`}`)
})

describe('order_log query helpers', () => {
  it('appendOrderLog inserts a row and returns it', async () => {
    const row = await appendOrderLog({
      squareOrderId: `${NS}_order_1`,
      eventType: 'payment.created',
      eventId: `${NS}_event_1`,
      payload: { foo: 'bar' }
    })
    expect(row.squareOrderId).toBe(`${NS}_order_1`)
    expect(row.eventType).toBe('payment.created')
    expect(row.eventId).toBe(`${NS}_event_1`)
    expect(row.receivedAt).toBeInstanceOf(Date)
  })

  it('hasEventId returns true after appendOrderLog with the same id', async () => {
    await appendOrderLog({
      squareOrderId: `${NS}_order_2`,
      eventType: 'payment.created',
      eventId: `${NS}_event_2`,
      payload: {}
    })
    expect(await hasEventId(`${NS}_event_2`)).toBe(true)
  })

  it('hasEventId returns false for unknown id', async () => {
    expect(await hasEventId(`${NS}_event_unknown`)).toBe(false)
  })

  it('hasEventId distinguishes empty string from null', async () => {
    // Null eventIds (e.g. non-webhook log writes) should never match a lookup.
    await appendOrderLog({
      squareOrderId: `${NS}_order_null`,
      eventType: 'manual',
      eventId: null,
      payload: {}
    })
    expect(await hasEventId('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — should fail**

Run: `pnpm test:integration tests/integration/order-log.integration.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/lib/db/queries/order-log.ts`**

```ts
import 'server-only'
import { db } from '@/lib/db/client'
import { type OrderLogEntry, orderLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface AppendOrderLogInput {
  squareOrderId: string
  eventType: string
  /** Nullable for non-webhook writes; webhook writes ALWAYS set this. */
  eventId: string | null
  payload: unknown
}

export async function appendOrderLog(input: AppendOrderLogInput): Promise<OrderLogEntry> {
  const [row] = await db.insert(orderLog).values(input).returning()
  return row
}

/**
 * Webhook idempotency check. Returns true if we've already recorded
 * this Square event_id, false otherwise. Always returns false for the
 * empty string (defensive; an empty id should never match a recorded id).
 */
export async function hasEventId(eventId: string): Promise<boolean> {
  if (!eventId) return false
  const rows = await db
    .select({ id: orderLog.id })
    .from(orderLog)
    .where(eq(orderLog.eventId, eventId))
    .limit(1)
  return rows.length > 0
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:integration tests/integration/order-log.integration.test.ts`
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/order-log.ts tests/integration/order-log.integration.test.ts
git commit -m "Phase 7/A: order_log query helpers (appendOrderLog + hasEventId for idempotency)"
```

### Task A.4: sms-recipients query helpers + Zod schema + integration tests

**Files:**
- Create: `tests/integration/sms-recipients.integration.test.ts`
- Create: `src/lib/db/queries/sms-recipients.ts`

- [ ] **Step 1: Create the failing integration test**

```ts
import { db } from '@/lib/db/client'
import {
  createSmsRecipient,
  deleteSmsRecipient,
  getAllSmsRecipients,
  getEnabledRecipients,
  getSmsRecipientById,
  updateSmsRecipient
} from '@/lib/db/queries/sms-recipients'
import { smsRecipients } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { testNamespace } from '../helpers/db'

const NS = testNamespace('sms')

// Phone numbers can be arbitrary E.164; we prefix the namespace as the
// "country code"-ish part to keep them visually unique without colliding
// with real numbers.
function phone(suffix: string) {
  return `+1${NS.replace(/[^0-9]/g, '').slice(0, 6)}${suffix}`
}

afterAll(async () => {
  await db.delete(smsRecipients).where(sql`${smsRecipients.label} LIKE ${`${NS}%`}`)
})

describe('sms_recipients query helpers', () => {
  it('createSmsRecipient inserts a row', async () => {
    const row = await createSmsRecipient({
      phone: phone('111'),
      label: `${NS}_owner`,
      enabled: true
    })
    expect(row.id).toBeGreaterThan(0)
    expect(row.enabled).toBe(true)
    expect(row.label).toBe(`${NS}_owner`)
  })

  it('createSmsRecipient defaults enabled=true', async () => {
    const row = await createSmsRecipient({ phone: phone('222'), label: `${NS}_default` })
    expect(row.enabled).toBe(true)
  })

  it('createSmsRecipient rejects malformed phone via Zod', async () => {
    await expect(
      createSmsRecipient({ phone: 'not-a-number', label: `${NS}_bad` })
    ).rejects.toThrow()
  })

  it('rejects duplicate phone (unique constraint)', async () => {
    await createSmsRecipient({ phone: phone('333'), label: `${NS}_dup1` })
    await expect(
      createSmsRecipient({ phone: phone('333'), label: `${NS}_dup2` })
    ).rejects.toThrow()
  })

  it('getSmsRecipientById returns the row', async () => {
    const created = await createSmsRecipient({ phone: phone('444'), label: `${NS}_byid` })
    const found = await getSmsRecipientById(created.id)
    expect(found?.id).toBe(created.id)
  })

  it('getEnabledRecipients excludes disabled rows', async () => {
    await createSmsRecipient({ phone: phone('555'), label: `${NS}_enabled`, enabled: true })
    await createSmsRecipient({ phone: phone('666'), label: `${NS}_disabled`, enabled: false })
    const enabled = await getEnabledRecipients()
    const mine = enabled.filter((r) => r.label?.startsWith(NS))
    expect(mine.find((r) => r.label === `${NS}_enabled`)).toBeDefined()
    expect(mine.find((r) => r.label === `${NS}_disabled`)).toBeUndefined()
  })

  it('updateSmsRecipient toggles enabled', async () => {
    const created = await createSmsRecipient({ phone: phone('777'), label: `${NS}_toggle`, enabled: true })
    await updateSmsRecipient(created.id, { enabled: false })
    const after = await getSmsRecipientById(created.id)
    expect(after?.enabled).toBe(false)
  })

  it('deleteSmsRecipient removes the row', async () => {
    const created = await createSmsRecipient({ phone: phone('888'), label: `${NS}_delete` })
    await deleteSmsRecipient(created.id)
    expect(await getSmsRecipientById(created.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — should fail**

Run: `pnpm test:integration tests/integration/sms-recipients.integration.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `src/lib/db/queries/sms-recipients.ts`**

```ts
import 'server-only'
import { db } from '@/lib/db/client'
import { type SmsRecipient, smsRecipients } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

export const SmsRecipientInputSchema = z.object({
  /** E.164 format: leading +, country code, then up to 14 digits. */
  phone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, 'must be E.164 (e.g. +14155552671)'),
  label: z.string().max(60).nullable().optional(),
  enabled: z.boolean().default(true)
})

export type SmsRecipientInput = z.input<typeof SmsRecipientInputSchema>

export async function getAllSmsRecipients(): Promise<SmsRecipient[]> {
  return db.select().from(smsRecipients).orderBy(asc(smsRecipients.id))
}

export async function getEnabledRecipients(): Promise<SmsRecipient[]> {
  return db
    .select()
    .from(smsRecipients)
    .where(eq(smsRecipients.enabled, true))
    .orderBy(asc(smsRecipients.id))
}

export async function getSmsRecipientById(id: number): Promise<SmsRecipient | undefined> {
  const rows = await db.select().from(smsRecipients).where(eq(smsRecipients.id, id)).limit(1)
  return rows[0]
}

export async function createSmsRecipient(input: SmsRecipientInput): Promise<SmsRecipient> {
  const parsed = SmsRecipientInputSchema.parse(input)
  const [row] = await db
    .insert(smsRecipients)
    .values({
      phone: parsed.phone,
      label: parsed.label ?? null,
      enabled: parsed.enabled
    })
    .returning()
  return row
}

export async function updateSmsRecipient(
  id: number,
  input: Partial<SmsRecipientInput>
): Promise<SmsRecipient> {
  const parsed = SmsRecipientInputSchema.partial().parse(input)
  const patch: Partial<typeof smsRecipients.$inferInsert> = {}
  if (parsed.phone !== undefined) patch.phone = parsed.phone
  if (parsed.label !== undefined) patch.label = parsed.label ?? null
  if (parsed.enabled !== undefined) patch.enabled = parsed.enabled
  const [row] = await db
    .update(smsRecipients)
    .set(patch)
    .where(eq(smsRecipients.id, id))
    .returning()
  if (!row) throw new Error(`sms_recipients ${id} not found`)
  return row
}

export async function deleteSmsRecipient(id: number): Promise<void> {
  await db.delete(smsRecipients).where(eq(smsRecipients.id, id))
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:integration tests/integration/sms-recipients.integration.test.ts`
Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/sms-recipients.ts tests/integration/sms-recipients.integration.test.ts
git commit -m "Phase 7/A: sms_recipients query helpers + Zod E.164 schema + integration tests"
```

### Task A.5: Group A acceptance gate

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
```

Expected:
- lint + typecheck clean
- Unit: 191 (unchanged in Group A)
- Integration: 55 + 8 + 4 + 8 = 75 passing

---

## Task Group B — Checkout server modules

Three pure(-ish) server modules: cart validation, Square Order creation, Payment Link creation. All accept clearly typed inputs and return well-typed outputs. Independent of Group A.

### Task B.1: validate-cart (price drift detector)

**Files:**
- Create: `tests/checkout/validate-cart.test.ts`
- Create: `src/lib/checkout/validate-cart.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/checkout/validate-cart.test.ts
import { describe, expect, it, vi } from 'vitest'

const mockGetProductById = vi.fn()
vi.mock('@/lib/products/cache', () => ({ getProductById: mockGetProductById }))

import { validateCart } from '@/lib/checkout/validate-cart'

function product(itemId: string, varId: string, name: string, priceCents: number) {
  return {
    id: itemId,
    name,
    description: null,
    descriptionHtml: null,
    variations: [{ id: varId, name: 'Default', price: { amount: priceCents, currency: 'USD' }, sku: null, optionValueIds: [] }],
    images: [],
    categoryIds: [],
    itemOptions: [],
    updatedAt: '2026-05-26T00:00:00Z'
  }
}

describe('validateCart', () => {
  it('returns ok with line list when all prices match', async () => {
    mockGetProductById.mockImplementation(async (id: string) => product(id, 'V', `${id} name`, 2500))
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 2, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lines).toHaveLength(1)
      expect(result.lines[0].name).toBe('A name')
      expect(result.lines[0].unitPriceCents).toBe(2500)
    }
  })

  it('tolerates 1 cent drift (rounding)', async () => {
    mockGetProductById.mockImplementation(async () => product('A', 'V', 'A', 2501))
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(true)
  })

  it('rejects drift > 1 cent', async () => {
    mockGetProductById.mockImplementation(async () => product('A', 'V', 'A', 3000))
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.mismatches[0]).toEqual({
        catalogItemId: 'A', variationId: 'V', expected: 2500, actual: 3000
      })
    }
  })

  it('rejects item that no longer exists (getProductById returns null)', async () => {
    mockGetProductById.mockResolvedValue(null)
    const result = await validateCart([
      { catalogItemId: 'GONE', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.mismatches[0]).toEqual({
        catalogItemId: 'GONE', variationId: 'V', expected: 2500, actual: null
      })
    }
  })

  it('rejects variation that no longer exists on product', async () => {
    mockGetProductById.mockImplementation(async () => product('A', 'V_REAL', 'A', 2500))
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V_GONE', quantity: 1, expectedUnitPriceCents: 2500 }
    ])
    expect(result.ok).toBe(false)
  })

  it('returns ALL mismatches, not just the first', async () => {
    mockGetProductById.mockImplementation(async (id: string) =>
      id === 'A' ? product('A', 'V', 'A', 9999) : product('B', 'V', 'B', 9999)
    )
    const result = await validateCart([
      { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 100 },
      { catalogItemId: 'B', variationId: 'V', quantity: 1, expectedUnitPriceCents: 200 }
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.mismatches).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Implement `src/lib/checkout/validate-cart.ts`**

```ts
import 'server-only'
import { getProductById } from '@/lib/products/cache'

export interface CartLineInput {
  catalogItemId: string
  variationId: string
  quantity: number
  expectedUnitPriceCents: number
}

export interface ValidatedLine {
  catalogItemId: string
  variationId: string
  quantity: number
  unitPriceCents: number
  name: string
}

export interface ValidationMismatch {
  catalogItemId: string
  variationId: string
  expected: number
  actual: number | null
}

export type ValidationResult =
  | { ok: true; lines: ValidatedLine[] }
  | { ok: false; mismatches: ValidationMismatch[] }

const DRIFT_TOLERANCE_CENTS = 1

export async function validateCart(items: CartLineInput[]): Promise<ValidationResult> {
  const uniqueIds = Array.from(new Set(items.map((i) => i.catalogItemId)))
  const productEntries = await Promise.all(
    uniqueIds.map(async (id) => [id, await getProductById(id)] as const)
  )
  const productMap = new Map(productEntries)

  const mismatches: ValidationMismatch[] = []
  const lines: ValidatedLine[] = []

  for (const item of items) {
    const product = productMap.get(item.catalogItemId)
    if (!product) {
      mismatches.push({
        catalogItemId: item.catalogItemId,
        variationId: item.variationId,
        expected: item.expectedUnitPriceCents,
        actual: null
      })
      continue
    }
    const variation = product.variations.find((v) => v.id === item.variationId)
    if (!variation?.price) {
      mismatches.push({
        catalogItemId: item.catalogItemId,
        variationId: item.variationId,
        expected: item.expectedUnitPriceCents,
        actual: null
      })
      continue
    }
    const actual = variation.price.amount
    if (Math.abs(actual - item.expectedUnitPriceCents) > DRIFT_TOLERANCE_CENTS) {
      mismatches.push({
        catalogItemId: item.catalogItemId,
        variationId: item.variationId,
        expected: item.expectedUnitPriceCents,
        actual
      })
      continue
    }
    lines.push({
      catalogItemId: item.catalogItemId,
      variationId: item.variationId,
      quantity: item.quantity,
      unitPriceCents: actual,
      name: product.name
    })
  }

  if (mismatches.length > 0) return { ok: false, mismatches }
  return { ok: true, lines }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/checkout/validate-cart.test.ts`
Expected: 6/6 pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/checkout/validate-cart.ts tests/checkout/validate-cart.test.ts
git commit -m "Phase 7/B: validateCart with 1c drift tolerance + per-line mismatch reporting"
```

### Task B.2: create-order (Square Orders API)

**Files:**
- Create: `tests/checkout/create-order.test.ts`
- Create: `src/lib/checkout/create-order.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/checkout/create-order.test.ts
import { describe, expect, it, vi } from 'vitest'

const mockOrdersCreate = vi.fn()
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ orders: { create: mockOrdersCreate } })
}))

import { createSquareOrder } from '@/lib/checkout/create-order'

const LINES = [
  { catalogItemId: 'A', variationId: 'V_A', quantity: 2, unitPriceCents: 2500, name: 'Item A' },
  { catalogItemId: 'B', variationId: 'V_B', quantity: 1, unitPriceCents: 3000, name: 'Item B' }
]

describe('createSquareOrder', () => {
  it('returns orderId on success', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_123' } })
    const result = await createSquareOrder({
      lines: LINES,
      cartId: 'cart-uuid',
      locationId: 'LOC_X'
    })
    expect(result.orderId).toBe('ORDER_123')
  })

  it('passes locationId and lineItems to Square', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_456' } })
    await createSquareOrder({ lines: LINES, cartId: 'cart-uuid', locationId: 'LOC_X' })
    const call = mockOrdersCreate.mock.calls[0][0]
    expect(call.order.locationId).toBe('LOC_X')
    expect(call.order.lineItems).toHaveLength(2)
    expect(call.order.lineItems[0].catalogObjectId).toBe('V_A')
    expect(call.order.lineItems[0].quantity).toBe('2')
  })

  it('sets cart_id in metadata and as reference_id', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_789' } })
    await createSquareOrder({ lines: LINES, cartId: 'cart-uuid-abc', locationId: 'LOC_X' })
    const call = mockOrdersCreate.mock.calls[0][0]
    expect(call.order.referenceId).toBe('cart-uuid-abc')
    expect(call.order.metadata).toEqual({ cart_id: 'cart-uuid-abc' })
  })

  it('uses idempotencyKey = cartId so retries do not double-create orders', async () => {
    mockOrdersCreate.mockResolvedValue({ order: { id: 'ORDER_X' } })
    await createSquareOrder({ lines: LINES, cartId: 'cart-uuid-idem', locationId: 'LOC_X' })
    expect(mockOrdersCreate.mock.calls[0][0].idempotencyKey).toBe('cart-uuid-idem')
  })

  it('throws if Square response lacks order.id', async () => {
    mockOrdersCreate.mockResolvedValue({ order: null })
    await expect(
      createSquareOrder({ lines: LINES, cartId: 'cart-uuid', locationId: 'LOC_X' })
    ).rejects.toThrow(/order id/i)
  })
})
```

- [ ] **Step 2: Implement `src/lib/checkout/create-order.ts`**

```ts
import 'server-only'
import { getSquareClient } from '@/lib/square/client'
import type { ValidatedLine } from './validate-cart'

export interface CreateOrderArgs {
  lines: ValidatedLine[]
  cartId: string
  locationId: string
}

export async function createSquareOrder(args: CreateOrderArgs): Promise<{ orderId: string }> {
  const client = getSquareClient()
  const response = await client.orders.create({
    idempotencyKey: args.cartId,
    order: {
      locationId: args.locationId,
      referenceId: args.cartId,
      lineItems: args.lines.map((line) => ({
        catalogObjectId: line.variationId,
        quantity: String(line.quantity)
      })),
      metadata: { cart_id: args.cartId }
    }
  })
  // biome-ignore lint/suspicious/noExplicitAny: SDK return shape varies
  const orderId = (response as any).order?.id
  if (typeof orderId !== 'string' || orderId.length === 0) {
    throw new Error('Square orders.create returned no order id')
  }
  return { orderId }
}
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm vitest run tests/checkout/create-order.test.ts
# 5/5 pass
git add src/lib/checkout/create-order.ts tests/checkout/create-order.test.ts
git commit -m "Phase 7/B: createSquareOrder via Square Orders API with idempotencyKey=cartId"
```

### Task B.3: create-payment-link (Square Checkout API)

**Files:**
- Create: `tests/checkout/create-payment-link.test.ts`
- Create: `src/lib/checkout/create-payment-link.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/checkout/create-payment-link.test.ts
import { describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ checkout: { paymentLinks: { create: mockCreate } } })
}))

import { createPaymentLink } from '@/lib/checkout/create-payment-link'

describe('createPaymentLink', () => {
  it('returns checkoutUrl on success', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: 'https://sandbox.squareup.com/...' } })
    const result = await createPaymentLink({
      orderId: 'ORDER_X',
      redirectUrl: 'https://dev.animeniacs.shop/checkout/success'
    })
    expect(result.checkoutUrl).toBe('https://sandbox.squareup.com/...')
  })

  it('passes orderId + redirectUrl to Square', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: 'https://sandbox.squareup.com/x' } })
    await createPaymentLink({ orderId: 'ORDER_Y', redirectUrl: 'https://example.com/done' })
    const call = mockCreate.mock.calls[0][0]
    expect(call.orderId).toBe('ORDER_Y')
    expect(call.checkoutOptions.redirectUrl).toBe('https://example.com/done')
  })

  it('uses orderId as idempotencyKey (re-call returns same link)', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: 'https://...' } })
    await createPaymentLink({ orderId: 'ORDER_Z', redirectUrl: 'https://example.com/done' })
    expect(mockCreate.mock.calls[0][0].idempotencyKey).toBe('ORDER_Z')
  })

  it('throws if Square response lacks paymentLink.url', async () => {
    mockCreate.mockResolvedValue({ paymentLink: { url: null } })
    await expect(
      createPaymentLink({ orderId: 'ORDER_X', redirectUrl: 'https://x' })
    ).rejects.toThrow(/payment link/i)
  })
})
```

- [ ] **Step 2: Implement `src/lib/checkout/create-payment-link.ts`**

```ts
import 'server-only'
import { getSquareClient } from '@/lib/square/client'

export interface CreatePaymentLinkArgs {
  orderId: string
  redirectUrl: string
}

export async function createPaymentLink(
  args: CreatePaymentLinkArgs
): Promise<{ checkoutUrl: string }> {
  const client = getSquareClient()
  const response = await client.checkout.paymentLinks.create({
    idempotencyKey: args.orderId,
    orderId: args.orderId,
    checkoutOptions: { redirectUrl: args.redirectUrl }
  })
  // biome-ignore lint/suspicious/noExplicitAny: SDK return shape varies
  const url = (response as any).paymentLink?.url
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Square checkout.paymentLinks.create returned no payment link URL')
  }
  return { checkoutUrl: url }
}
```

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/checkout/create-payment-link.test.ts
# 4/4 pass
git add src/lib/checkout/create-payment-link.ts tests/checkout/create-payment-link.test.ts
git commit -m "Phase 7/B: createPaymentLink via Square Checkout API"
```

### Task B.4: Group B acceptance gate

```sh
pnpm lint && pnpm typecheck && pnpm test
```
- Unit: 191 + 6 + 5 + 4 = 206 passing
- Integration: 75 (unchanged in Group B)

---

## Task Group C — Webhook + notifications

### Task C.1: Signature verifier

**Files:**
- Create: `tests/webhooks/verify-signature.test.ts`
- Create: `src/lib/webhooks/verify-signature.ts`

- [ ] **Step 1: Failing tests**

```ts
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifySquareSignature } from '@/lib/webhooks/verify-signature'

const KEY = 'super-secret-signature-key'
const URL = 'https://dev.animeniacs.shop/api/webhooks/square'
const BODY = '{"event_id":"abc","type":"payment.created"}'

function sign(body: string, url: string, key: string) {
  return createHmac('sha256', key).update(url + body).digest('base64')
}

describe('verifySquareSignature', () => {
  it('returns true for a valid signature', () => {
    const sig = sign(BODY, URL, KEY)
    expect(
      verifySquareSignature({ rawBody: BODY, signatureHeader: sig, notificationUrl: URL, signatureKey: KEY })
    ).toBe(true)
  })

  it('returns false for a wrong signature', () => {
    expect(
      verifySquareSignature({ rawBody: BODY, signatureHeader: 'wrong', notificationUrl: URL, signatureKey: KEY })
    ).toBe(false)
  })

  it('returns false when body is tampered', () => {
    const sig = sign(BODY, URL, KEY)
    expect(
      verifySquareSignature({ rawBody: BODY + ' ', signatureHeader: sig, notificationUrl: URL, signatureKey: KEY })
    ).toBe(false)
  })

  it('returns false when url is tampered', () => {
    const sig = sign(BODY, URL, KEY)
    expect(
      verifySquareSignature({ rawBody: BODY, signatureHeader: sig, notificationUrl: URL + 'x', signatureKey: KEY })
    ).toBe(false)
  })

  it('returns false for empty signature header', () => {
    expect(
      verifySquareSignature({ rawBody: BODY, signatureHeader: '', notificationUrl: URL, signatureKey: KEY })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Implement `src/lib/webhooks/verify-signature.ts`**

```ts
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface VerifySignatureArgs {
  rawBody: string
  signatureHeader: string
  notificationUrl: string
  signatureKey: string
}

export function verifySquareSignature(args: VerifySignatureArgs): boolean {
  if (!args.signatureHeader || !args.signatureKey) return false
  const expected = createHmac('sha256', args.signatureKey)
    .update(args.notificationUrl + args.rawBody)
    .digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(args.signatureHeader)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
```

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/webhooks/verify-signature.test.ts
# 5/5 pass
git add src/lib/webhooks/verify-signature.ts tests/webhooks/verify-signature.test.ts
git commit -m "Phase 7/C: Square webhook HMAC-SHA256 signature verifier"
```

### Task C.2: Discord notification sender

**Files:**
- Create: `tests/notifications/discord.test.ts`
- Create: `src/lib/notifications/discord.ts`

- [ ] **Step 1: Failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendDiscordOrderNotification } from '@/lib/notifications/discord'

const fetchMock = vi.fn()
beforeEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: stub
  global.fetch = fetchMock as any
})
afterEach(() => fetchMock.mockReset())

describe('sendDiscordOrderNotification', () => {
  it('POSTs to the webhook URL with an embed', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 204 }))
    await sendDiscordOrderNotification({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      orderId: 'ORDER_X',
      totalCents: 4500,
      itemCount: 2,
      buyerEmail: 'buyer@example.com'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://discord.com/api/webhooks/123/abc')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body.embeds[0].title).toMatch(/new order/i)
    expect(JSON.stringify(body)).toContain('ORDER_X')
    expect(JSON.stringify(body)).toContain('$45.00')
    expect(JSON.stringify(body)).toContain('buyer@example.com')
  })

  it('omits buyer email field when null', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 204 }))
    await sendDiscordOrderNotification({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      orderId: 'ORDER_Y',
      totalCents: 1000,
      itemCount: 1,
      buyerEmail: null
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('does not throw if fetch fails (caller-handled)', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    await expect(
      sendDiscordOrderNotification({
        webhookUrl: 'https://x',
        orderId: 'O',
        totalCents: 100,
        itemCount: 1,
        buyerEmail: null
      })
    ).resolves.not.toThrow()
  })

  it('does not throw on non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }))
    await expect(
      sendDiscordOrderNotification({
        webhookUrl: 'https://x',
        orderId: 'O',
        totalCents: 100,
        itemCount: 1,
        buyerEmail: null
      })
    ).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Implement `src/lib/notifications/discord.ts`**

```ts
import 'server-only'

export interface SendDiscordArgs {
  webhookUrl: string
  orderId: string
  totalCents: number
  itemCount: number
  buyerEmail: string | null
}

export async function sendDiscordOrderNotification(args: SendDiscordArgs): Promise<void> {
  const fields = [
    { name: 'Order', value: args.orderId, inline: true },
    { name: 'Total', value: `$${(args.totalCents / 100).toFixed(2)}`, inline: true },
    { name: 'Items', value: String(args.itemCount), inline: true }
  ]
  if (args.buyerEmail) {
    fields.push({ name: 'Buyer', value: args.buyerEmail, inline: false })
  }

  const body = {
    embeds: [
      {
        title: 'New order on animeniacs.shop',
        color: 0x00b894,
        fields,
        timestamp: new Date().toISOString()
      }
    ]
  }

  try {
    await fetch(args.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (err) {
    // Caller-handled. Webhook handler logs but does not 500 to Square.
    console.error('[discord] notification failed:', err)
  }
}
```

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/notifications/discord.test.ts
# 4/4 pass
git add src/lib/notifications/discord.ts tests/notifications/discord.test.ts
git commit -m "Phase 7/C: sendDiscordOrderNotification via webhook URL embed"
```

### Task C.3: SMS notification sender

**Files:**
- Create: `tests/notifications/sms.test.ts`
- Create: `src/lib/notifications/sms.ts`

- [ ] **Step 1: Failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetEnabled = vi.fn()
vi.mock('@/lib/db/queries/sms-recipients', () => ({ getEnabledRecipients: mockGetEnabled }))

import { notifyEnabledRecipients, sendOrderSms } from '@/lib/notifications/sms'

const fetchMock = vi.fn()
beforeEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: stub
  global.fetch = fetchMock as any
  process.env.SMSGATE_BASE_URL = 'https://sms.example'
  process.env.SMSGATE_USER = 'user'
  process.env.SMSGATE_PASS = 'pass'
})
afterEach(() => {
  fetchMock.mockReset()
  mockGetEnabled.mockReset()
})

describe('sendOrderSms', () => {
  it('POSTs to SMSGATE_BASE_URL/send with Basic auth header', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await sendOrderSms({
      recipient: { phone: '+14155552671', label: 'Owner' },
      orderId: 'ORDER_X',
      totalCents: 4500,
      itemCount: 2
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sms.example/send')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
    const body = JSON.parse(String(init.body))
    expect(body.to).toBe('+14155552671')
    expect(body.message).toContain('$45.00')
    expect(body.message).toContain('ORDER_X')
  })

  it('does not throw on network error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    await expect(
      sendOrderSms({
        recipient: { phone: '+1', label: null },
        orderId: 'O',
        totalCents: 100,
        itemCount: 1
      })
    ).resolves.not.toThrow()
  })
})

describe('notifyEnabledRecipients', () => {
  it('sends one SMS per enabled recipient', async () => {
    mockGetEnabled.mockResolvedValue([
      { id: 1, phone: '+14155551111', label: 'A', enabled: true, createdAt: new Date() },
      { id: 2, phone: '+14155552222', label: 'B', enabled: true, createdAt: new Date() }
    ])
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await notifyEnabledRecipients({ orderId: 'O', totalCents: 100, itemCount: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('one failed recipient does not block others', async () => {
    mockGetEnabled.mockResolvedValue([
      { id: 1, phone: '+1', label: null, enabled: true, createdAt: new Date() },
      { id: 2, phone: '+2', label: null, enabled: true, createdAt: new Date() }
    ])
    fetchMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(new Response('', { status: 200 }))
    await expect(
      notifyEnabledRecipients({ orderId: 'O', totalCents: 100, itemCount: 1 })
    ).resolves.not.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no-ops when there are no enabled recipients', async () => {
    mockGetEnabled.mockResolvedValue([])
    await notifyEnabledRecipients({ orderId: 'O', totalCents: 100, itemCount: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement `src/lib/notifications/sms.ts`**

```ts
import 'server-only'
import { getEnabledRecipients } from '@/lib/db/queries/sms-recipients'

export interface SendSmsArgs {
  recipient: { phone: string; label: string | null }
  orderId: string
  totalCents: number
  itemCount: number
}

function buildMessage(args: { orderId: string; totalCents: number; itemCount: number }): string {
  return `New order $${(args.totalCents / 100).toFixed(2)} (${args.itemCount} items) on animeniacs.shop — order ${args.orderId}`
}

export async function sendOrderSms(args: SendSmsArgs): Promise<void> {
  const baseUrl = process.env.SMSGATE_BASE_URL
  const user = process.env.SMSGATE_USER
  const pass = process.env.SMSGATE_PASS
  if (!baseUrl || !user || !pass) {
    console.error('[sms] missing SMSGATE_* env vars; skipping send')
    return
  }
  try {
    await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
      },
      body: JSON.stringify({
        to: args.recipient.phone,
        message: buildMessage({
          orderId: args.orderId,
          totalCents: args.totalCents,
          itemCount: args.itemCount
        })
      })
    })
  } catch (err) {
    console.error(`[sms] failed to send to ${args.recipient.phone}:`, err)
  }
}

export interface NotifyArgs {
  orderId: string
  totalCents: number
  itemCount: number
}

export async function notifyEnabledRecipients(args: NotifyArgs): Promise<void> {
  const recipients = await getEnabledRecipients()
  await Promise.all(
    recipients.map((r) =>
      sendOrderSms({
        recipient: { phone: r.phone, label: r.label },
        orderId: args.orderId,
        totalCents: args.totalCents,
        itemCount: args.itemCount
      })
    )
  )
}
```

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/notifications/sms.test.ts
# 5/5 pass
git add src/lib/notifications/sms.ts tests/notifications/sms.test.ts
git commit -m "Phase 7/C: SMS notifications via sms-edge HTTP API + per-recipient fanout"
```

### Task C.4: Webhook event handler

**Files:**
- Create: `tests/webhooks/handle-event.test.ts`
- Create: `src/lib/webhooks/handle-event.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockAppendLog = vi.fn()
const mockHasEventId = vi.fn()
const mockMarkCompleted = vi.fn()
const mockGetCart = vi.fn()
const mockDiscord = vi.fn()
const mockSmsNotify = vi.fn()

vi.mock('@/lib/db/queries/order-log', () => ({
  appendOrderLog: mockAppendLog,
  hasEventId: mockHasEventId
}))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({
  markCartCompleted: mockMarkCompleted,
  getCartBySquareOrderId: mockGetCart
}))
vi.mock('@/lib/notifications/discord', () => ({
  sendDiscordOrderNotification: mockDiscord
}))
vi.mock('@/lib/notifications/sms', () => ({
  notifyEnabledRecipients: mockSmsNotify
}))

import { handleSquareEvent } from '@/lib/webhooks/handle-event'

beforeEach(() => {
  mockAppendLog.mockReset()
  mockHasEventId.mockReset().mockResolvedValue(false)
  mockMarkCompleted.mockReset()
  mockGetCart.mockReset()
  mockDiscord.mockReset()
  mockSmsNotify.mockReset()
})

function paymentEvent(over: Record<string, unknown> = {}) {
  return {
    event_id: 'EVT_1',
    type: 'payment.created',
    data: {
      object: {
        payment: {
          order_id: 'ORDER_X',
          total_money: { amount: 4500, currency: 'USD' },
          buyer_email_address: 'buyer@example.com'
        }
      }
    },
    ...over
  }
}

describe('handleSquareEvent', () => {
  it('appends to order_log for every event type', async () => {
    await handleSquareEvent({ event: paymentEvent({ type: 'unknown.event' }), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockAppendLog).toHaveBeenCalledTimes(1)
  })

  it('skips notifications when event_id was already processed', async () => {
    mockHasEventId.mockResolvedValue(true)
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockAppendLog).toHaveBeenCalledTimes(1)
    expect(mockDiscord).not.toHaveBeenCalled()
    expect(mockSmsNotify).not.toHaveBeenCalled()
  })

  it('on payment.created: marks cart completed + fans out notifications', async () => {
    mockGetCart.mockResolvedValue({
      cartId: 'cart-uuid',
      squareOrderId: 'ORDER_X',
      cartSnapshot: { items: [{ catalogItemId: 'A', variationId: 'V', quantity: 2 }] },
      buyerEmail: null,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      reminderSentAt: null
    })
    process.env.DISCORD_ORDER_WEBHOOK_URL = 'https://discord.test/webhook'
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockMarkCompleted).toHaveBeenCalledWith('ORDER_X')
    expect(mockDiscord).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORDER_X',
        totalCents: 4500,
        itemCount: 2,
        buyerEmail: 'buyer@example.com'
      })
    )
    expect(mockSmsNotify).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ORDER_X', totalCents: 4500, itemCount: 2 })
    )
  })

  it('payment.created without a known cart still fires notifications with itemCount=0', async () => {
    mockGetCart.mockResolvedValue(undefined)
    process.env.DISCORD_ORDER_WEBHOOK_URL = 'https://discord.test/webhook'
    await handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    expect(mockDiscord).toHaveBeenCalledWith(expect.objectContaining({ itemCount: 0 }))
  })

  it('order.fulfillment.updated and refund.created are logged but do not fan out', async () => {
    await handleSquareEvent({
      event: { event_id: 'E', type: 'order.fulfillment.updated', data: { object: {} } },
      webhookUrl: 'x',
      signatureKey: 'k'
    })
    await handleSquareEvent({
      event: { event_id: 'E2', type: 'refund.created', data: { object: {} } },
      webhookUrl: 'x',
      signatureKey: 'k'
    })
    expect(mockAppendLog).toHaveBeenCalledTimes(2)
    expect(mockDiscord).not.toHaveBeenCalled()
    expect(mockSmsNotify).not.toHaveBeenCalled()
  })

  it('does not throw if downstream notification fails', async () => {
    mockGetCart.mockResolvedValue(undefined)
    mockDiscord.mockRejectedValue(new Error('discord down'))
    mockSmsNotify.mockRejectedValue(new Error('sms down'))
    process.env.DISCORD_ORDER_WEBHOOK_URL = 'https://discord.test/webhook'
    await expect(
      handleSquareEvent({ event: paymentEvent(), webhookUrl: 'x', signatureKey: 'k' })
    ).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Implement `src/lib/webhooks/handle-event.ts`**

```ts
import 'server-only'
import { getCartBySquareOrderId, markCartCompleted } from '@/lib/db/queries/abandoned-carts'
import { appendOrderLog, hasEventId } from '@/lib/db/queries/order-log'
import { sendDiscordOrderNotification } from '@/lib/notifications/discord'
import { notifyEnabledRecipients } from '@/lib/notifications/sms'

export interface HandleEventArgs {
  // biome-ignore lint/suspicious/noExplicitAny: Square event payload is unsafe
  event: any
  webhookUrl: string
  signatureKey: string
}

function extractOrderId(event: { type: string; data?: { object?: unknown } }): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: walking arbitrary payload
  const obj: any = event.data?.object ?? {}
  if (event.type.startsWith('payment.')) return obj.payment?.order_id ?? null
  if (event.type.startsWith('order.')) return obj.order?.id ?? obj.order_fulfillment_updated?.order_id ?? null
  if (event.type.startsWith('refund.')) return obj.refund?.order_id ?? null
  return null
}

function extractTotalCents(event: { data?: { object?: unknown } }): number {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const obj: any = event.data?.object ?? {}
  const amount = obj.payment?.total_money?.amount
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'number') return amount
  return 0
}

function extractBuyerEmail(event: { data?: { object?: unknown } }): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const obj: any = event.data?.object ?? {}
  const email = obj.payment?.buyer_email_address
  return typeof email === 'string' && email.length > 0 ? email : null
}

function countItemsInSnapshot(snapshot: unknown): number {
  // biome-ignore lint/suspicious/noExplicitAny: snapshot is jsonb
  const items: any[] | undefined = (snapshot as any)?.items
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, e) => sum + (typeof e?.quantity === 'number' ? e.quantity : 0), 0)
}

export async function handleSquareEvent(args: HandleEventArgs): Promise<void> {
  const { event } = args
  const squareOrderId = extractOrderId(event) ?? '(unknown)'

  // Always log the event regardless of type.
  await appendOrderLog({
    squareOrderId,
    eventType: event.type,
    eventId: event.event_id ?? null,
    payload: event
  })

  // Idempotency check. If we've already processed this event_id,
  // the log row was written (above) but notification fanout is skipped.
  // Note: hasEventId is checked AFTER appendOrderLog so the new row's
  // event_id is in the DB. We re-query to see if there's MORE THAN ONE
  // row with this event_id — that's the duplicate signal.
  // Simpler: read the original spec: check hasEventId BEFORE append?
  // We rely on the order_log table holding one row per delivery; for
  // idempotency of notifications, we check whether THIS is the first
  // delivery. We use hasEventId to test, but since we just appended,
  // we must compare counts. Simpler: pre-check.
  // Actually, for correctness we pre-check before appending notifications.
  // Re-architect: check hasEventId at the top, but still always log.
  // Rework: caller passed event; idempotency check needs to happen
  // before notification fanout. We rely on the appendOrderLog row
  // (above) being unique per delivery — Square may redeliver the same
  // event_id; we want to ack 200 either way but only fan out once.
  // For Phase 7 v1: skip notifications if more than one row exists for
  // this event_id. (The current row we just inserted counts as one;
  // a duplicate delivery would produce two.)
  if (event.event_id) {
    // hasEventId returns true if ANY row matches; since we just inserted one,
    // we need to check if there's MORE than one. Easiest: pre-check before insert.
    // Reordering: pre-check, then insert.
    // (Implementation note: see refactored version below.)
  }

  // Fan-out only for payment.created.
  if (event.type === 'payment.created') {
    await markCartCompleted(squareOrderId)
    const cart = await getCartBySquareOrderId(squareOrderId)
    const itemCount = cart ? countItemsInSnapshot(cart.cartSnapshot) : 0
    const totalCents = extractTotalCents(event)
    const buyerEmail = extractBuyerEmail(event)

    const discordUrl = process.env.DISCORD_ORDER_WEBHOOK_URL
    if (discordUrl) {
      try {
        await sendDiscordOrderNotification({
          webhookUrl: discordUrl,
          orderId: squareOrderId,
          totalCents,
          itemCount,
          buyerEmail
        })
      } catch (err) {
        console.error('[webhook] discord failed:', err)
      }
    }

    try {
      await notifyEnabledRecipients({ orderId: squareOrderId, totalCents, itemCount })
    } catch (err) {
      console.error('[webhook] sms fanout failed:', err)
    }
  }
}
```

Wait — the idempotency logic above is muddled. Replace with cleaner pre-check-then-insert version:

```ts
import 'server-only'
import { getCartBySquareOrderId, markCartCompleted } from '@/lib/db/queries/abandoned-carts'
import { appendOrderLog, hasEventId } from '@/lib/db/queries/order-log'
import { sendDiscordOrderNotification } from '@/lib/notifications/discord'
import { notifyEnabledRecipients } from '@/lib/notifications/sms'

export interface HandleEventArgs {
  // biome-ignore lint/suspicious/noExplicitAny: Square event payload
  event: any
  webhookUrl: string
  signatureKey: string
}

function extractOrderId(event: { type: string; data?: { object?: unknown } }): string {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const obj: any = event.data?.object ?? {}
  if (event.type.startsWith('payment.')) return obj.payment?.order_id ?? '(unknown)'
  if (event.type.startsWith('order.')) return obj.order?.id ?? '(unknown)'
  if (event.type.startsWith('refund.')) return obj.refund?.order_id ?? '(unknown)'
  return '(unknown)'
}

function extractTotalCents(event: { data?: { object?: unknown } }): number {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const amount = (event.data?.object as any)?.payment?.total_money?.amount
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'number') return amount
  return 0
}

function extractBuyerEmail(event: { data?: { object?: unknown } }): string | null {
  // biome-ignore lint/suspicious/noExplicitAny: walking payload
  const email = (event.data?.object as any)?.payment?.buyer_email_address
  return typeof email === 'string' && email.length > 0 ? email : null
}

function countItemsInSnapshot(snapshot: unknown): number {
  // biome-ignore lint/suspicious/noExplicitAny: snapshot is jsonb
  const items: any[] | undefined = (snapshot as any)?.items
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, e) => sum + (typeof e?.quantity === 'number' ? e.quantity : 0), 0)
}

export async function handleSquareEvent(args: HandleEventArgs): Promise<void> {
  const { event } = args
  const squareOrderId = extractOrderId(event)
  const eventId: string | null = event.event_id ?? null

  // Idempotency check BEFORE log + fanout. If this event_id was already
  // recorded, just log the duplicate delivery and skip fanout.
  const alreadySeen = eventId ? await hasEventId(eventId) : false

  await appendOrderLog({
    squareOrderId,
    eventType: event.type,
    eventId,
    payload: event
  })

  if (alreadySeen) return

  if (event.type !== 'payment.created') return

  await markCartCompleted(squareOrderId)
  const cart = await getCartBySquareOrderId(squareOrderId)
  const itemCount = cart ? countItemsInSnapshot(cart.cartSnapshot) : 0
  const totalCents = extractTotalCents(event)
  const buyerEmail = extractBuyerEmail(event)

  const discordUrl = process.env.DISCORD_ORDER_WEBHOOK_URL
  if (discordUrl) {
    try {
      await sendDiscordOrderNotification({
        webhookUrl: discordUrl,
        orderId: squareOrderId,
        totalCents,
        itemCount,
        buyerEmail
      })
    } catch (err) {
      console.error('[webhook] discord failed:', err)
    }
  }

  try {
    await notifyEnabledRecipients({ orderId: squareOrderId, totalCents, itemCount })
  } catch (err) {
    console.error('[webhook] sms fanout failed:', err)
  }
}
```

Use the second (clean) version. Discard the first.

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/webhooks/handle-event.test.ts
# 6/6 pass
git add src/lib/webhooks/handle-event.ts tests/webhooks/handle-event.test.ts
git commit -m "Phase 7/C: webhook event dispatcher (idempotent, payment.created fans out)"
```

### Task C.5: Group C acceptance gate

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
```
- Unit: 206 + 5 + 4 + 5 + 6 = 226 passing
- Integration: 75 (unchanged)

---

## Task Group D — API route handlers

### Task D.1: `POST /api/checkout`

**Files:**
- Create: `tests/api/checkout.test.ts`
- Create: `src/app/api/checkout/route.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/api/checkout.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockValidate = vi.fn()
const mockCreateOrder = vi.fn()
const mockCreateLink = vi.fn()
const mockCreatePending = vi.fn()

vi.mock('@/lib/checkout/validate-cart', () => ({ validateCart: mockValidate }))
vi.mock('@/lib/checkout/create-order', () => ({ createSquareOrder: mockCreateOrder }))
vi.mock('@/lib/checkout/create-payment-link', () => ({ createPaymentLink: mockCreateLink }))
vi.mock('@/lib/db/queries/abandoned-carts', () => ({ createPendingCart: mockCreatePending }))

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

afterEach(() => {
  mockValidate.mockReset()
  mockCreateOrder.mockReset()
  mockCreateLink.mockReset()
  mockCreatePending.mockReset()
})

describe('POST /api/checkout', () => {
  it('happy path returns checkoutUrl + cartId', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }]
    })
    mockCreateOrder.mockResolvedValue({ orderId: 'ORDER_X' })
    mockCreateLink.mockResolvedValue({ checkoutUrl: 'https://square/checkout' })
    mockCreatePending.mockResolvedValue({})
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://dev.animeniacs.shop'

    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [
          { catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }
        ]
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.checkoutUrl).toBe('https://square/checkout')
    expect(typeof json.cartId).toBe('string')
    expect(mockCreateOrder).toHaveBeenCalled()
    expect(mockCreatePending).toHaveBeenCalled()
  })

  it('returns 409 with mismatches when validateCart rejects', async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      mismatches: [{ catalogItemId: 'A', variationId: 'V', expected: 2500, actual: 3000 }]
    })
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('price_changed')
    expect(json.mismatches).toHaveLength(1)
    expect(mockCreateOrder).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed body', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest('not json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when items array is missing', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 on empty items array', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(makeRequest({ items: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 500 when Square order creation throws', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }]
    })
    mockCreateOrder.mockRejectedValue(new Error('square down'))
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(500)
  })

  it('returns 500 if SQUARE_LOCATION_ID is unset', async () => {
    process.env.SQUARE_LOCATION_ID = ''
    mockValidate.mockResolvedValue({ ok: true, lines: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }] })
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(res.status).toBe(500)
  })

  it('persists abandoned_carts row with status=pending before creating payment link', async () => {
    mockValidate.mockResolvedValue({
      ok: true,
      lines: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, unitPriceCents: 2500, name: 'A' }]
    })
    mockCreateOrder.mockResolvedValue({ orderId: 'ORDER_Y' })
    mockCreateLink.mockResolvedValue({ checkoutUrl: 'https://x' })
    mockCreatePending.mockResolvedValue({})
    process.env.SQUARE_LOCATION_ID = 'LOC_X'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x'
    const { POST } = await import('@/app/api/checkout/route')
    await POST(
      makeRequest({
        items: [{ catalogItemId: 'A', variationId: 'V', quantity: 1, expectedUnitPriceCents: 2500 }]
      })
    )
    expect(mockCreatePending).toHaveBeenCalledWith(
      expect.objectContaining({ squareOrderId: 'ORDER_Y', buyerEmail: null })
    )
  })

  it('does not export a GET handler', async () => {
    const mod = await import('@/app/api/checkout/route')
    expect((mod as Record<string, unknown>).GET).toBeUndefined()
  })
})
```

- [ ] **Step 2: Implement `src/app/api/checkout/route.ts`**

```ts
import { createSquareOrder } from '@/lib/checkout/create-order'
import { createPaymentLink } from '@/lib/checkout/create-payment-link'
import { validateCart } from '@/lib/checkout/validate-cart'
import { createPendingCart } from '@/lib/db/queries/abandoned-carts'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const RequestSchema = z.object({
  items: z
    .array(
      z.object({
        catalogItemId: z.string().min(1),
        variationId: z.string().min(1),
        quantity: z.number().int().positive(),
        expectedUnitPriceCents: z.number().int().nonnegative()
      })
    )
    .min(1)
    .max(50)
})

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const locationId = process.env.SQUARE_LOCATION_ID
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!locationId || !siteUrl) {
    console.error('[checkout] missing SQUARE_LOCATION_ID or NEXT_PUBLIC_SITE_URL')
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    )
  }

  try {
    const validation = await validateCart(parsed.data.items)
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'price_changed', mismatches: validation.mismatches },
        { status: 409 }
      )
    }

    const cartId = randomUUID()
    const { orderId } = await createSquareOrder({
      lines: validation.lines,
      cartId,
      locationId
    })

    await createPendingCart({
      cartId,
      squareOrderId: orderId,
      cartSnapshot: { items: parsed.data.items },
      buyerEmail: null
    })

    const { checkoutUrl } = await createPaymentLink({
      orderId,
      redirectUrl: `${siteUrl}/checkout/success`
    })

    return NextResponse.json({ checkoutUrl, cartId })
  } catch (err) {
    console.error('[checkout] failure:', err)
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/api/checkout.test.ts
# 9/9 pass
git add src/app/api/checkout/route.ts tests/api/checkout.test.ts
git commit -m "Phase 7/D: POST /api/checkout (validate → order → abandoned_carts → payment link)"
```

### Task D.2: `POST /api/webhooks/square`

**Files:**
- Create: `tests/api/webhooks-square.test.ts`
- Create: `src/app/api/webhooks/square/route.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/api/webhooks-square.test.ts
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandle = vi.fn()
vi.mock('@/lib/webhooks/handle-event', () => ({ handleSquareEvent: mockHandle }))

const KEY = 'test-signature-key'
const URL_BASE = 'https://dev.animeniacs.shop'

function sign(body: string, fullUrl: string, key: string) {
  return createHmac('sha256', key).update(fullUrl + body).digest('base64')
}

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request(`${URL_BASE}/api/webhooks/square`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body
  })
}

beforeEach(() => {
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY
  process.env.NEXT_PUBLIC_SITE_URL = URL_BASE
})

afterEach(() => {
  mockHandle.mockReset()
})

describe('POST /api/webhooks/square', () => {
  it('200s and calls handleSquareEvent on valid signature', async () => {
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created', data: { object: {} } })
    const sig = sign(body, `${URL_BASE}/api/webhooks/square`, KEY)
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': sig }))
    expect(res.status).toBe(200)
    expect(mockHandle).toHaveBeenCalled()
  })

  it('401 on invalid signature', async () => {
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created' })
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': 'bogus' }))
    expect(res.status).toBe(401)
    expect(mockHandle).not.toHaveBeenCalled()
  })

  it('401 when signature header missing', async () => {
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created' })
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(401)
  })

  it('400 on unparseable body', async () => {
    const body = 'not json'
    const sig = sign(body, `${URL_BASE}/api/webhooks/square`, KEY)
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': sig }))
    expect(res.status).toBe(400)
  })

  it('500 when handler throws (Square will retry)', async () => {
    mockHandle.mockRejectedValue(new Error('db down'))
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created', data: { object: {} } })
    const sig = sign(body, `${URL_BASE}/api/webhooks/square`, KEY)
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': sig }))
    expect(res.status).toBe(500)
  })

  it('500 when SQUARE_WEBHOOK_SIGNATURE_KEY env is missing', async () => {
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = ''
    const body = JSON.stringify({ event_id: 'E', type: 'payment.created' })
    const { POST } = await import('@/app/api/webhooks/square/route')
    const res = await POST(makeRequest(body, { 'x-square-hmacsha256-signature': 'anything' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Implement `src/app/api/webhooks/square/route.ts`**

```ts
import { handleSquareEvent } from '@/lib/webhooks/handle-event'
import { verifySquareSignature } from '@/lib/webhooks/verify-signature'
import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<NextResponse> {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!signatureKey || !siteUrl) {
    console.error('[webhook] missing SQUARE_WEBHOOK_SIGNATURE_KEY or NEXT_PUBLIC_SITE_URL')
    return new NextResponse(null, { status: 500 })
  }

  // Square computes the HMAC over the EXACT URL it called + the raw body
  // bytes. Reconstructing the notification URL from headers is fragile
  // behind proxies; trust NEXT_PUBLIC_SITE_URL as the canonical base
  // and append the known path.
  const notificationUrl = `${siteUrl}/api/webhooks/square`

  const rawBody = await request.text()
  const signature = request.headers.get('x-square-hmacsha256-signature') ?? ''
  const valid = verifySquareSignature({
    rawBody,
    signatureHeader: signature,
    notificationUrl,
    signatureKey
  })
  if (!valid) return new NextResponse(null, { status: 401 })

  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  try {
    await handleSquareEvent({
      event,
      webhookUrl: notificationUrl,
      signatureKey
    })
    return new NextResponse(null, { status: 200 })
  } catch (err) {
    console.error('[webhook] handler failed:', err)
    // 5xx tells Square to retry. Don't echo error details.
    return new NextResponse(null, { status: 500 })
  }
}
```

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/api/webhooks-square.test.ts
# 6/6 pass
git add src/app/api/webhooks/square/route.ts tests/api/webhooks-square.test.ts
git commit -m "Phase 7/D: POST /api/webhooks/square (HMAC verify → dispatch to handle-event)"
```

### Task D.3: Group D acceptance gate

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
```
- Unit: 226 + 9 + 6 = 241 passing
- Integration: 75 unchanged
- Build adds 2 routes: `ƒ /api/checkout`, `ƒ /api/webhooks/square`

---

## Task Group E — Drawer Checkout button + /checkout/success page

### Task E.1: Drop `DISABLED_CHECKOUT_TOOLTIP` from site-copy

**Files:**
- Modify: `src/lib/site-copy.ts`

- [ ] **Step 1: Remove the constant**

Delete the `DISABLED_CHECKOUT_TOOLTIP` export and its JSDoc. Keep `PRODUCTION_TIME_TEXT` and the three `CART_BADGE_*` consts.

- [ ] **Step 2: Find and clean up references**

Run: `grep -rn "DISABLED_CHECKOUT_TOOLTIP" src/ tests/`

Expected current references:
- `src/components/cart/CartDrawer.tsx` — will be reworked in E.2
- `tests/cart/cart-drawer.test.tsx` — will be reworked in E.2

Don't commit this task standalone; bundle with E.2.

### Task E.2: Wire CartDrawer Checkout button

**Files:**
- Modify: `src/components/cart/CartDrawer.tsx`
- Modify: `tests/cart/cart-drawer.test.tsx`

- [ ] **Step 1: Rewrite the CartDrawer Checkout button section**

In `src/components/cart/CartDrawer.tsx`, replace the disabled `<button>` + `<small>` hint with a live wiring:

```tsx
// Add at top of file with other imports
import { useState } from 'react'

// Inside the CartDrawer component, before the return statement:
const [isCheckingOut, setIsCheckingOut] = useState(false)
const [checkoutError, setCheckoutError] = useState<string | null>(null)

async function handleCheckout() {
  if (items.length === 0 || isCheckingOut) return
  setIsCheckingOut(true)
  setCheckoutError(null)
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((e) => {
          const product = products[e.catalogItemId]
          const variation = product?.variations.find((v) => v.id === e.variationId)
          return {
            catalogItemId: e.catalogItemId,
            variationId: e.variationId,
            quantity: e.quantity,
            expectedUnitPriceCents: variation?.price?.amount ?? 0
          }
        })
      })
    })
    if (res.status === 409) {
      setCheckoutError('Some prices have changed. Please review your cart.')
      refresh()
      return
    }
    if (!res.ok) {
      setCheckoutError('Could not start checkout. Please try again.')
      return
    }
    const json = await res.json()
    if (typeof json.checkoutUrl !== 'string') {
      setCheckoutError('Unexpected checkout response. Please try again.')
      return
    }
    window.location.href = json.checkoutUrl
  } catch {
    setCheckoutError('Network error. Please try again.')
  } finally {
    setIsCheckingOut(false)
  }
}

// Replace the existing footer's <button disabled> + <small> with:
{checkoutError && (
  <p role="alert" className={styles.checkoutError}>
    {checkoutError}
  </p>
)}
<button
  type="button"
  onClick={handleCheckout}
  disabled={items.length === 0 || isCheckingOut}
  className={styles.checkout}
>
  {isCheckingOut ? 'Starting checkout…' : 'Checkout'}
</button>
```

`refresh` comes from `useCartHydration()` — make sure that hook's return value is destructured to include `refresh`.

Remove the `<small>{DISABLED_CHECKOUT_TOOLTIP}</small>` line. Remove the import of `DISABLED_CHECKOUT_TOOLTIP`. Update `CartDrawer.module.css` to add a `.checkoutError` class (red text, small spacing).

- [ ] **Step 2: Rewrite the CartDrawer tests**

Open `tests/cart/cart-drawer.test.tsx` and:
1. Remove the test "checkout button is disabled with launch tooltip" (E.1 dropped the constant).
2. Add new tests:

```tsx
it('Checkout button is disabled when cart is empty', async () => {
  renderWithCart(<DrawerOpener />)
  fireEvent.click(screen.getByText('open'))
  await screen.findByRole('dialog')
  expect(screen.getByRole('button', { name: /checkout/i })).toBeDisabled()
})

it('Checkout button is enabled when cart has items', async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ products: { A: product('A', 'V', 'Print A', 1500) } }),
      { status: 200 }
    )
  )
  renderWithCart(<DrawerOpener />, {
    initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 })]
  })
  fireEvent.click(screen.getByText('open'))
  await waitFor(() => expect(screen.getByText('Print A')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /^checkout$/i })).not.toBeDisabled()
})

it('Clicking Checkout POSTs to /api/checkout and redirects on success', async () => {
  // First fetch is the hydrate; second is the checkout.
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ products: { A: product('A', 'V', 'Print A', 1500) } }),
        { status: 200 }
      )
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ checkoutUrl: 'https://square/co', cartId: 'c' }), { status: 200 })
    )

  // Stub window.location.href assignment
  const originalLocation = window.location
  delete (window as any).location
  ;(window as any).location = { href: '' }

  renderWithCart(<DrawerOpener />, {
    initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 })]
  })
  fireEvent.click(screen.getByText('open'))
  await waitFor(() => expect(screen.getByText('Print A')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /^checkout$/i }))

  await waitFor(() => expect((window as any).location.href).toBe('https://square/co'))

  ;(window as any).location = originalLocation
})

it('Shows error when /api/checkout returns 409 (price changed)', async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ products: { A: product('A', 'V', 'Print A', 1500) } }),
        { status: 200 }
      )
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'price_changed', mismatches: [] }), { status: 409 })
    )
  renderWithCart(<DrawerOpener />, {
    initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 })]
  })
  fireEvent.click(screen.getByText('open'))
  await waitFor(() => expect(screen.getByText('Print A')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /^checkout$/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/prices have changed/i))
})

it('Shows error when /api/checkout returns 500', async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ products: { A: product('A', 'V', 'Print A', 1500) } }),
        { status: 200 }
      )
    )
    .mockResolvedValueOnce(new Response('error', { status: 500 }))
  renderWithCart(<DrawerOpener />, {
    initialItems: [makeEntry({ catalogItemId: 'A', variationId: 'V', quantity: 1 })]
  })
  fireEvent.click(screen.getByText('open'))
  await waitFor(() => expect(screen.getByText('Print A')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /^checkout$/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/try again/i))
})
```

- [ ] **Step 3: Test + commit**

```bash
pnpm vitest run tests/cart/cart-drawer.test.tsx
# all pass (existing tests + new ones)
git add src/lib/site-copy.ts src/components/cart/CartDrawer.tsx src/components/cart/CartDrawer.module.css tests/cart/cart-drawer.test.tsx
git commit -m "Phase 7/E: live CartDrawer Checkout button; drop DISABLED_CHECKOUT_TOOLTIP"
```

### Task E.3: /checkout/success page

**Files:**
- Create: `src/app/checkout/success/page.tsx`
- Create: `src/app/checkout/success/loading.tsx`
- Create: `src/app/checkout/success/error.tsx`
- Create: `tests/public/checkout-success-page.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
// tests/public/checkout-success-page.test.tsx
import CheckoutSuccessPage from '@/app/checkout/success/page'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

const mockGetSquare = vi.fn()
vi.mock('@/lib/square/client', () => ({
  getSquareClient: () => ({ orders: { get: mockGetSquare } })
}))

const mockMarkCompleted = vi.fn()
vi.mock('@/lib/db/queries/abandoned-carts', () => ({
  markCartCompleted: mockMarkCompleted
}))

describe('CheckoutSuccessPage', () => {
  it('renders generic thanks when orderId is missing', async () => {
    const ui = await CheckoutSuccessPage({ searchParams: {} })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/thanks/i)
  })

  it('renders order details when Square returns the order', async () => {
    mockGetSquare.mockResolvedValue({
      order: {
        id: 'ORDER_X',
        totalMoney: { amount: 4500n, currency: 'USD' },
        lineItems: [
          { name: 'Cool Print', quantity: '2', basePriceMoney: { amount: 2000n } }
        ]
      }
    })
    const ui = await CheckoutSuccessPage({ searchParams: { orderId: 'ORDER_X' } })
    render(ui)
    expect(screen.getByText(/ORDER_X/)).toBeInTheDocument()
    expect(screen.getByText('Cool Print')).toBeInTheDocument()
    expect(screen.getByText(/\$45\.00/)).toBeInTheDocument()
  })

  it('renders generic thanks when Square returns no order', async () => {
    mockGetSquare.mockResolvedValue({ order: null })
    const ui = await CheckoutSuccessPage({ searchParams: { orderId: 'NOPE' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/thanks/i)
  })

  it('renders generic thanks when Square throws', async () => {
    mockGetSquare.mockRejectedValue(new Error('boom'))
    const ui = await CheckoutSuccessPage({ searchParams: { orderId: 'X' } })
    render(ui)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/thanks/i)
  })

  it('marks the abandoned cart completed when order found', async () => {
    mockGetSquare.mockResolvedValue({
      order: {
        id: 'ORDER_Y',
        totalMoney: { amount: 1000n, currency: 'USD' },
        lineItems: []
      }
    })
    await CheckoutSuccessPage({ searchParams: { orderId: 'ORDER_Y' } })
    expect(mockMarkCompleted).toHaveBeenCalledWith('ORDER_Y')
  })
})
```

- [ ] **Step 2: Implement the page**

```tsx
// src/app/checkout/success/page.tsx
import { markCartCompleted } from '@/lib/db/queries/abandoned-carts'
import { getSquareClient } from '@/lib/square/client'
import Script from 'next/script'

interface PageProps {
  searchParams: { orderId?: string }
}

export const metadata = {
  title: 'Thanks for your order | Animeniacs'
}

// biome-ignore lint/suspicious/noExplicitAny: SDK shape
async function fetchOrderSafely(orderId: string): Promise<any> {
  try {
    const client = getSquareClient()
    const response = await client.orders.get({ orderId })
    // biome-ignore lint/suspicious/noExplicitAny: SDK envelope
    return (response as any).order ?? null
  } catch (err) {
    console.error('[checkout-success] order fetch failed:', err)
    return null
  }
}

function formatMoney(amount: bigint | number | undefined): string {
  if (amount === undefined) return ''
  const cents = typeof amount === 'bigint' ? Number(amount) : amount
  return `$${(cents / 100).toFixed(2)}`
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const orderId = searchParams.orderId
  if (!orderId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-3xl font-bold">Thanks for your order!</h1>
        <p className="mt-4 text-gray-700">
          Your payment was received. You'll get a confirmation email from Square shortly.
        </p>
      </main>
    )
  }

  const order = await fetchOrderSafely(orderId)

  if (!order) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-3xl font-bold">Thanks for your order!</h1>
        <p className="mt-4 text-gray-700">
          Your payment was received. You'll get a confirmation email from Square shortly.
        </p>
      </main>
    )
  }

  // Fire-and-forget DB write — if it fails, the webhook will eventually flip the status.
  try {
    await markCartCompleted(order.id)
  } catch (err) {
    console.error('[checkout-success] markCartCompleted failed:', err)
  }

  const totalCents =
    typeof order.totalMoney?.amount === 'bigint'
      ? Number(order.totalMoney.amount)
      : (order.totalMoney?.amount ?? 0)

  return (
    <>
      <Script id="plausible-checkout-completed" strategy="afterInteractive">
        {`if (typeof window !== 'undefined' && window.plausible) { window.plausible('checkout_completed', { props: { orderId: ${JSON.stringify(order.id)}, revenueCents: ${totalCents} } }); }`}
      </Script>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-bold">Thanks for your order!</h1>
        <p className="mt-4 text-gray-700">
          Order <code>{order.id}</code> received. You'll get a confirmation email from Square shortly.
        </p>

        {Array.isArray(order.lineItems) && order.lineItems.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">What you ordered</h2>
            <ul className="mt-3 divide-y divide-gray-200">
              {order.lineItems.map((line: any, idx: number) => (
                <li key={idx} className="flex justify-between py-3">
                  <span>
                    {line.name} × {line.quantity}
                  </span>
                  <span>{formatMoney(line.basePriceMoney?.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-2xl font-semibold">Total: {formatMoney(order.totalMoney?.amount)}</p>
      </main>
    </>
  )
}
```

- [ ] **Step 3: Create loading.tsx + error.tsx**

```tsx
// src/app/checkout/success/loading.tsx
export default function Loading(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="h-8 w-1/2 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-gray-200" />
      <div className="mt-8 h-4 w-full animate-pulse rounded bg-gray-200" />
    </main>
  )
}
```

```tsx
// src/app/checkout/success/error.tsx
'use client'

export default function CheckoutSuccessError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}): JSX.Element {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Thanks for your order!</h1>
      <p className="mb-4 text-gray-600">
        Your payment was received. You'll get a confirmation email from Square shortly.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-gray-900 px-4 py-2 text-white"
      >
        Reload
      </button>
      <details className="mt-6 text-xs text-gray-400">
        <summary>Technical details</summary>
        <code>{error.message}</code>
      </details>
    </main>
  )
}
```

- [ ] **Step 4: Test + commit**

```bash
pnpm vitest run tests/public/checkout-success-page.test.tsx
# 5/5 pass
git add src/app/checkout/success/ tests/public/checkout-success-page.test.tsx
git commit -m "Phase 7/E: /checkout/success page + loading + error states"
```

### Task E.4: Group E acceptance gate

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
- Unit: 241 + rewrites + 5 (success page) + ~5 new drawer cases - 1 removed = ~250 passing
- Build adds 1 route: `/checkout/success`

---

## Task Group F — /admin/sms-recipients CRUD

Mirrors `/admin/artists` and `/admin/ip-nicknames` patterns. Implementer should reference one of those existing admin areas as the template — same form pattern, same useFormState, same Zod validation, same unique-violation translation, same Logto auth gate inheritance.

### Task F.1: SmsRecipientForm + formData + validation

**Files:**
- Create: `src/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm.tsx`
- Create: `src/app/(admin)/admin/sms-recipients/_components/formData.ts`
- Create: `src/app/(admin)/admin/sms-recipients/_components/validation.ts`

Follow exactly the shape of `src/app/(admin)/admin/ip-nicknames/_components/IpNicknameForm.tsx`, `formData.ts`, `validation.ts`. Differences:

- Form fields: phone (E.164), label (optional), enabled (radio: Enabled / Disabled).
- Phone is readOnly in edit mode.
- Zod schema imports from `@/lib/db/queries/sms-recipients` (`SmsRecipientInputSchema`).
- Unique-violation detector recognizes `sms_recipients_phone_unique` constraint name.

Commit when typecheck passes:

```bash
git add src/app/(admin)/admin/sms-recipients/_components/
git commit -m "Phase 7/F: SmsRecipientForm + formData + validation helpers"
```

### Task F.2: Server actions

**Files:**
- Create: `src/app/(admin)/admin/sms-recipients/new/actions.ts`
- Create: `src/app/(admin)/admin/sms-recipients/[id]/actions.ts`

Pattern matches `src/app/(admin)/admin/ip-nicknames/new/actions.ts` and `[id]/actions.ts`. Differences:

- `[id]` actions take an integer (not UUID); param parsing uses `Number(...)` with NaN guard returning notFound().
- `[id]/actions.ts` also exports `deleteSmsRecipientAction(id: number)` (no equivalent in artists/ip-nicknames). Wires to `deleteSmsRecipient` from queries; revalidates `/admin/sms-recipients`; redirects back to the list.
- Both create + update actions revalidate `/admin/sms-recipients` on success.

Commit:

```bash
git add src/app/(admin)/admin/sms-recipients/new/actions.ts src/app/(admin)/admin/sms-recipients/[id]/actions.ts
git commit -m "Phase 7/F: sms-recipients server actions (create, update, delete)"
```

### Task F.3: Server action tests

**Files:**
- Create: `tests/admin/sms-recipients-actions.test.ts`

Pattern matches `tests/admin/ip-nicknames-actions.test.ts`. Cases:
- create happy path
- create with invalid phone (non-E.164) returns field error without DB hit
- create with duplicate phone returns "phone already used" field error
- update happy path
- delete happy path (calls delete query + redirects)
- update with missing id throws

Commit:

```bash
git add tests/admin/sms-recipients-actions.test.ts
git commit -m "Phase 7/F: sms-recipients server-action unit tests"
```

### Task F.4: List / new / edit pages

**Files:**
- Create: `src/app/(admin)/admin/sms-recipients/page.tsx`
- Create: `src/app/(admin)/admin/sms-recipients/new/page.tsx`
- Create: `src/app/(admin)/admin/sms-recipients/[id]/page.tsx`

Pattern matches the artists/ip-nicknames sibling admin areas. Differences for the list page:

| Column | Source |
|---|---|
| Enabled | green badge if `enabled=true`, gray if false |
| Label | `label ?? '—'` |
| Phone | `phone` in mono font |
| Created | `createdAt` formatted as locale date |
| — | edit link + delete form (inline `<form action={deleteSmsRecipientAction.bind(null, id)}>`) |

Edit page: `parseInt(params.id)` with NaN→notFound() guard; binds `updateSmsRecipientAction` to the id like other admin sections.

After all three pages exist, run:

```bash
pnpm typecheck && pnpm build
# Build lists 3 new routes: /admin/sms-recipients, /admin/sms-recipients/new, /admin/sms-recipients/[id]
git add src/app/(admin)/admin/sms-recipients/page.tsx src/app/(admin)/admin/sms-recipients/new/page.tsx src/app/(admin)/admin/sms-recipients/[id]/page.tsx
git commit -m "Phase 7/F: /admin/sms-recipients list + new + edit pages"
```

### Task F.5: Group F acceptance gate

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
```
- Unit: ~250 + ~6 = ~256 passing
- Integration: 75 unchanged
- Build adds 3 admin routes

---

## Task Group G — Final acceptance gate + handoff + tag

### Task G.1: Hard-constraint canary + automated gate

```sh
grep -rn "goaffpro\|GoAffPro" src/ tests/   # → zero
pnpm vitest run tests/public/product-detail-page.test.tsx tests/public/category-page.test.tsx
# → IP-leak regression tests green
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
```

Expected totals:
- Unit: ~256 (191 baseline + ~65 new)
- Integration: 75 (55 baseline + 20 new)
- Build lists ~35 routes (30 from Phase 6 + 5 new: `/api/checkout`, `/api/webhooks/square`, `/checkout/success`, `/admin/sms-recipients`, `/admin/sms-recipients/[id]`, `/admin/sms-recipients/new`)

### Task G.2: Operator credentials check

Surface to operator:

> Before deploying to dev.animeniacs.shop for smoke, confirm these are set in BOTH `.env.local` AND Coolify env for the dev deployment:
>
> 1. `SQUARE_WEBHOOK_SIGNATURE_KEY` — from Square sandbox dashboard webhook subscription pointing at `https://dev.animeniacs.shop/api/webhooks/square` (events: `payment.created`, `order.fulfillment.updated`, `refund.created`).
> 2. `DISCORD_ORDER_WEBHOOK_URL` — from your Discord channel's webhook.
> 3. `SMSGATE_USER`, `SMSGATE_PASS`, `SMSGATE_BASE_URL` — from existing sms-edge deployment.

Wait for operator confirmation before continuing to G.3.

### Task G.3: Manual smoke checklist on dev.animeniacs.shop

Operator runs:

1. Deploy to `dev.animeniacs.shop` via Coolify.
2. Visit a product page on dev. Add to cart. Open drawer. Click Checkout.
3. Land on Square sandbox checkout. Pay with test card `4111 1111 1111 1111`, any future expiry, any CVV.
4. Land on `/checkout/success`. See confirmation with order ID, line items, total.
5. Check Postgres on dev: `abandoned_carts` row has `status='completed'` and `square_order_id` populated.
6. Check Postgres: `order_log` has at least one `payment.created` row.
7. Check Discord channel: order embed appeared.
8. Add operator's own phone to `sms_recipients` via `/admin/sms-recipients/new` (after auth). Repeat steps 2-4 with a different cart. Verify SMS arrives.
9. Disable that recipient via `/admin/sms-recipients/[id]`. Repeat checkout. Verify no SMS.
10. Re-enable; delete via the delete form in the list. Verify row gone.
11. Confirm Square dashboard sandbox shows the test orders.
12. Confirm hard constraints intact: `grep -rn "goaffpro" src/ tests/` is zero; IP-leak regression tests pass.

### Task G.4: Write `docs/superpowers/specs/reference/phase-07-handoff.md`

Mirror `phase-06-handoff.md` structure. Required sections:

1. TL;DR (cart → checkout → success + webhook + Discord/SMS notifications; sandbox-first; tag at HEAD).
2. Required reading order (this doc, phase-06-handoff, phase-05-handoff, phase-07 spec + plan, master design spec §6/§9 noting GoAffPro references to ignore).
3. What Phase 7 actually shipped (code table mirroring siblings; tests added ~65 unit + 20 integration; schema: one new nullable column on order_log).
4. Plan deviations Phase 7 should know about (anything that differed).
5. Hard constraints (still in force) — verbatim from Phase 6.
6. What's deferred (everything Phase 8+ still needs to ship: promo bar + /admin/settings, abandoned-cart reminder emails, wishlist, reviews, recently-viewed, /shop listing page, IP cover uploads, refund notifications, etc.).
7. Where credentials live (.env.local; flag the three new ones Phase 7 added).
8. Phase 8 scope (suggested, not locked) — likely candidates: promo bar + /admin/settings (so the 20% promo can actually fire); OR abandoned-cart reminder emails (Resend, drives revenue from pending carts); OR refund notifications (smaller, completes the webhook event coverage). Don't lock — next master terminal brainstorm will choose.
9. Verification state at handoff (exact numbers).
10. How to verify this hand-off is correct (bootstrap commands).

Commit:

```bash
git add docs/superpowers/specs/reference/phase-07-handoff.md
git commit -m "Phase 7 to Phase 8 hand-off doc"
```

### Task G.5: Tag the phase

After operator confirms G.3 smoke green AND G.4 handoff doc is committed:

```sh
git tag phase-7-checkout
git push origin main --tags   # only if operator confirms ready to push
```

### Task G.6: Surface back to operator

> Phase 7 done, handoff doc at `docs/superpowers/specs/reference/phase-07-handoff.md`, tag `phase-7-checkout` applied at `<short-sha>`.

---

## Spec self-review (plan vs spec coverage)

| Spec section | Covered by |
|---|---|
| §4 Acceptance criteria | G.1 + G.3 |
| §5 Architecture overview | File-structure table at top; module decomposition follows §5 exactly |
| §6 Data flow happy path | D.1 (checkout endpoint) + E.3 (success page) + D.2 (webhook) implement this end-to-end |
| §7.1 validate-cart | B.1 |
| §7.2 create-order | B.2 |
| §7.3 create-payment-link | B.3 |
| §7.4 verify-signature | C.1 |
| §7.5 handle-event | C.4 |
| §7.6 discord notification | C.2 |
| §7.7 sms notification | C.3 |
| §7.8 abandoned-carts queries | A.2 |
| §7.9 order-log queries + event_id column | A.1 + A.3 |
| §7.10 sms-recipients queries | A.4 |
| §8.1 /api/checkout contract | D.1 |
| §8.2 /api/webhooks/square contract | D.2 |
| §9.1-9.3 admin pages | F.1-F.4 |
| §10 drawer wiring | E.1 + E.2 |
| §11 env vars | Operator pre-flight checklist + G.2 |
| §12 testing | All test files declared across A-F |

No spec sections without a task.

Type consistency: `ValidatedLine`, `ValidationResult`, `CartLineInput`, `CreateOrderArgs`, `CreatePaymentLinkArgs`, `SendDiscordArgs`, `SendSmsArgs`, `NotifyArgs`, `HandleEventArgs`, `CreatePendingCartInput`, `AppendOrderLogInput`, `SmsRecipientInput` — all defined in their introducing task and referenced consistently downstream.

Placeholder scan: no "TBD" / "TODO" / "implement later" found in the plan body. (Self-check note in this self-review section is the only match.)

---

## End of plan.



