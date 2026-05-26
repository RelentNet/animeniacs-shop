# Phase 7 — Checkout + webhook + notifications design spec

**Status:** APPROVED design (operator approved scope via clarifying questions; remaining decisions self-locked by master terminal for time), ready to plan.
**Date:** 2026-05-26
**Predecessor:** `docs/superpowers/specs/reference/phase-06-handoff.md`
**Next step:** invoke `superpowers:writing-plans` to produce
`docs/superpowers/plans/2026-05-26-phase-07-checkout.md`.

---

## 0. Goals

Close the buy-flow loop. A customer can complete a real (sandbox)
payment end-to-end: click the cart drawer's Checkout button, redirect
to Square's hosted checkout, pay with a test card, land back on
`/checkout/success`. Operators get reliable notifications (Discord +
SMS) when a payment completes, driven by the Square webhook so they
fire even if the buyer closes the tab on Square's page.

This is the first phase that does Square writes. Hard constraint #6
(sandbox-first) is load-bearing throughout.

## 1. Non-goals (Phase 7 does NOT ship)

- No promo / discount logic (Decision 4 deferred to Phase 8+ alongside
  `/admin/settings`). Phase 7 ships orders at full price.
- No tax calculation (TaxJar is spec §20, Phase 15+). Square handles
  tax-free orders fine for v1; orders ship without tax for now.
- No abandoned-cart reminder emails. `abandoned_carts` table tracks
  status; Resend integration is Phase 9.
- No GoAffPro affiliate tracking (banned per Phase 4 hard constraint #1).
- No order-status webhooks beyond `payment.created`, `order.fulfillment.updated`, `refund.created`.
- No "View My Orders" account page (Phase 10+).
- No newsletter signup on success page.
- No shipping-rate selection — Square's hosted page collects address
  and calculates shipping itself.
- No buyer-email pre-fill — guest checkout only in v1. Phase 10+
  (Logto-authenticated cart) pre-fills.

## 2. Hard constraints (in force from Phase 4)

1. **No GoAffPro at runtime.** Spec §9's checkout flow sketch references
   GoAffPro — IGNORE those references entirely.
2. **No `artist` Square custom attribute definition.**
3. **No new auth vendors.**
4. **No commission engine.** Manual monthly Square dashboard reporting.
5. **No additional Postgres tables for affiliate / commission tracking.**
   Phase 7 adds zero new tables; uses existing `abandoned_carts`,
   `order_log`, `sms_recipients`.
6. **Sandbox-first for any production write.** EVERY Square write in
   Phase 7 goes against `SQUARE_ENV=sandbox` by default. Production
   cutover is a one-line env change after operator confirms sandbox
   smoke passes on `dev.animeniacs.shop`.
7. **IP categories never public.** Two regression tests stay green.

## 3. Locked decisions

### Operator-approved during brainstorm

1. **Scope = full payment loop.** Cart → checkout → success page + webhook + Discord + SMS notifications in one phase.
2. **SMS recipients in DB.** Use the existing `sms_recipients` table + ship `/admin/sms-recipients` CRUD admin mirroring `/admin/artists` and `/admin/ip-nicknames` exactly.
3. **Sandbox testing on Coolify staging.** Webhook subscription points at `https://dev.animeniacs.shop/api/webhooks/square`. Smoke runs against the deployed staging site, not localhost+ngrok.
4. **No promo logic in Phase 7.** Deferred to Phase 8+ with `/admin/settings`.

### Self-locked by master terminal

5. **Cart re-validation at checkout time.** `/api/checkout` re-fetches each cart line's current price via Phase 5's `getProductById`. If any price drifts > 1¢ from what the cart UI showed, reject with HTTP 409 and a `{ error, mismatches: [...] }` body so the drawer can prompt the buyer to review.
6. **Currency = USD only.** No multi-currency support.
7. **Order metadata is minimal:** `cartId` (UUID we generate, also written to `abandoned_carts.cart_id`). Nothing else (no affiliate id, no promo, no UTM). Phase 8+ extends.
8. **Webhook signature verification** via Square's documented HMAC-SHA256 of `notificationUrl + bodyText` against `SQUARE_WEBHOOK_SIGNATURE_KEY`. Mismatch → 401. We never trust unverified payloads.
9. **`order_log` records every webhook event** regardless of type — useful debugging surface. Notification fanout only happens for the events we care about (`payment.created`).
10. **Webhook idempotency** keyed off Square's `event_id` header. Duplicate event → `order_log` write succeeds (with `received_at` reflecting the duplicate delivery), notifications skipped.
11. **Notification fanout discipline.** Discord first (one fetch), SMS second (loop). Each notification wrapped in try/catch so one failure doesn't block the other. Both wrapped at a higher level so a downstream outage doesn't 500 the webhook back to Square (we always ACK 200 if the DB writes succeeded; failed notifications log to console + the webhook is retried by Square on transient failure).
12. **`/checkout/success` UX guard:** if `?orderId=` is missing → 400 page. If order ID doesn't match any Square order (rare; bad bookmark) → render generic "Thanks for your order!" page without DB lookup. Never crash.
13. **Test discipline (continues Phase 5/6 patterns).** Mocked Square SDK for unit tests. Integration tests for `abandoned_carts` writes, `sms_recipients` CRUD, and the webhook handler against real Postgres (signature verification + DB writes verified). Manual smoke on `dev.animeniacs.shop` against Square sandbox. No Playwright (Decision 12 from Phase 5 continues).

## 4. Acceptance criteria

1. From `https://dev.animeniacs.shop/product/<real-item-id>`, Add to Cart → drawer Checkout → land on Square's hosted page → pay with sandbox test card `4111 1111 1111 1111` → land on `/checkout/success` → see confirmation with order id, line items, total.
2. `abandoned_carts` row visible in Postgres with `status='completed'` and `square_order_id` populated after step 1.
3. `order_log` row visible for the `payment.created` event after step 1.
4. Discord channel receives the order-notification embed.
5. SMS recipient in the `sms_recipients` table receives the SMS (operator inserts their own number for smoke; removes after).
6. `/admin/sms-recipients` CRUD works end-to-end: list, create, edit (enabled toggle), delete.
7. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` all clean. Tag `phase-7-checkout` applied.

## 5. Architecture overview

```
src/
├── app/
│   ├── api/
│   │   ├── checkout/route.ts                       # NEW POST handler
│   │   └── webhooks/square/route.ts                # NEW POST handler
│   ├── checkout/success/page.tsx                   # NEW server component
│   ├── checkout/success/loading.tsx                # NEW skeleton
│   ├── checkout/success/error.tsx                  # NEW (client)
│   └── (admin)/admin/sms-recipients/               # NEW admin CRUD
│       ├── page.tsx
│       ├── new/{page,actions}.ts(x)
│       ├── [id]/{page,actions}.ts(x)
│       └── _components/
│           ├── SmsRecipientForm.tsx
│           ├── formData.ts
│           └── validation.ts
├── components/
│   └── cart/
│       └── CartDrawer.tsx                          # MODIFY: wire Checkout button
├── lib/
│   ├── checkout/
│   │   ├── create-order.ts                         # NEW: build Square Order from cart
│   │   ├── create-payment-link.ts                  # NEW: call Square Checkout API
│   │   └── validate-cart.ts                        # NEW: re-fetch + price-drift detection
│   ├── webhooks/
│   │   ├── verify-signature.ts                     # NEW: HMAC-SHA256 verification
│   │   └── handle-event.ts                         # NEW: event dispatcher (writes log, fans out)
│   ├── notifications/
│   │   ├── discord.ts                              # NEW: fetch POST to Discord webhook
│   │   └── sms.ts                                  # NEW: fetch POST to sms-edge for each enabled recipient
│   ├── db/queries/
│   │   ├── abandoned-carts.ts                      # NEW: createPending, markCompleted, markAbandoned
│   │   ├── order-log.ts                            # NEW: append, hasEventId (idempotency check)
│   │   └── sms-recipients.ts                       # NEW: CRUD + getEnabledRecipients
│   ├── env.ts                                       # MODIFY: add new env vars
│   └── site-copy.ts                                 # MODIFY: remove DISABLED_CHECKOUT_TOOLTIP (button now live)
└── ...

tests/
├── api/
│   ├── checkout.test.ts                            # NEW (~10 cases)
│   └── webhooks-square.test.ts                     # NEW (~12 cases)
├── checkout/
│   ├── validate-cart.test.ts                       # NEW (~6 cases)
│   ├── create-order.test.ts                        # NEW (~5 cases)
│   └── create-payment-link.test.ts                 # NEW (~4 cases)
├── webhooks/
│   ├── verify-signature.test.ts                    # NEW (~5 cases)
│   └── handle-event.test.ts                        # NEW (~6 cases)
├── notifications/
│   ├── discord.test.ts                             # NEW (~4 cases)
│   └── sms.test.ts                                 # NEW (~5 cases)
├── admin/
│   └── sms-recipients-actions.test.ts              # NEW (~6 cases)
├── public/
│   └── checkout-success-page.test.tsx              # NEW (~5 cases)
├── cart/
│   └── cart-drawer.test.tsx                        # MODIFY: rewrite Checkout-button assertions
└── integration/
    ├── abandoned-carts.integration.test.ts         # NEW (~8 cases)
    ├── order-log.integration.test.ts               # NEW (~4 cases)
    └── sms-recipients.integration.test.ts          # NEW (~8 cases)
```

No new Drizzle migrations — all three tables (`abandoned_carts`, `order_log`, `sms_recipients`) shipped in Phase 2 schema and are unused until now.

## 6. Data flow — happy path

```
Cart drawer Checkout click
   │
   ▼
POST /api/checkout
   │   {
   │     items: [{ catalogItemId, variationId, quantity }, ...]
   │   }
   ├─ validateCart(items)  ────► getProductById for each, compute current prices
   │     │
   │     ├─ Drift > 1¢ on any line → 409 { error: 'price_changed', mismatches }
   │     └─ All good → continue
   │
   ├─ const cartId = randomUUID()
   ├─ createOrder(items, cartId)  ────► Square Orders API
   │     returns { orderId }
   │
   ├─ INSERT abandoned_carts (cart_id, square_order_id, status='pending',
   │       cart_snapshot=items, buyer_email=null)
   │
   ├─ createPaymentLink(orderId)  ────► Square Checkout API
   │     returns { checkoutUrl }
   │
   └─ 200 { checkoutUrl, cartId }
        │
        ▼
   Client: window.location.href = checkoutUrl
        │
        ▼
   Square hosted checkout page
        │  (buyer enters email/address/card, pays)
        ▼
   Square redirects to /checkout/success?orderId=<square_order_id>
        │
        ▼
   /checkout/success page
        ├─ If !orderId → 400 page
        ├─ Fetch order from Square Orders API
        │     │
        │     ├─ Not found → generic "Thanks!" page
        │     └─ Found → render confirmation (id, items, total)
        │
        ├─ UPDATE abandoned_carts SET status='completed' WHERE square_order_id=...
        │   (race-safe: idempotent UPDATE; webhook may have already done this)
        │
        └─ Client-side <Script> fires Plausible('checkout_completed', { revenue })

   ─── (parallel, async, fires whether buyer redirected or not) ───
   POST /api/webhooks/square
        │
        ├─ verifySignature(body, header)  ────► 401 if mismatch
        ├─ const event = JSON.parse(body)
        ├─ if (await hasEventId(event.event_id)) → 200, skip notifications
        ├─ orderLog.append({ squareOrderId, eventType: event.type, payload: event })
        │
        └─ switch (event.type):
              case 'payment.created':
                ├─ UPDATE abandoned_carts SET status='completed' WHERE square_order_id=...
                ├─ const recipients = getEnabledRecipients()
                ├─ try Discord.send(...) catch (log)
                ├─ for (r in recipients) try SMS.send(r, ...) catch (log)
                └─ 200
              case 'order.fulfillment.updated':
                ├─ orderLog already appended
                └─ 200  (no action yet; future phase adds /account refresh)
              case 'refund.created':
                ├─ orderLog already appended
                └─ 200  (future phase notifies on refund)
              default:
                └─ 200  (log captured, ignore)
```

## 7. Server modules

### 7.1 `src/lib/checkout/validate-cart.ts`

```ts
export interface CartLineInput {
  catalogItemId: string
  variationId: string
  quantity: number
  /** Price the client showed the buyer, in cents. Used to detect drift. */
  expectedUnitPriceCents: number
}

export interface ValidatedLine {
  catalogItemId: string
  variationId: string
  quantity: number
  unitPriceCents: number
  name: string  // for the Square Order line item display
}

export interface ValidationMismatch {
  catalogItemId: string
  variationId: string
  expected: number
  actual: number | null  // null = item or variation no longer exists
}

export type ValidationResult =
  | { ok: true; lines: ValidatedLine[] }
  | { ok: false; mismatches: ValidationMismatch[] }

export async function validateCart(items: CartLineInput[]): Promise<ValidationResult>
```

Calls `getProductById` for each unique `catalogItemId`. Tolerance for drift: `Math.abs(actual - expected) <= 1` (1¢, handles rounding edge cases). Item-missing or variation-missing → mismatch with `actual: null`.

### 7.2 `src/lib/checkout/create-order.ts`

```ts
export async function createSquareOrder(args: {
  lines: ValidatedLine[]
  cartId: string
  locationId: string
}): Promise<{ orderId: string }>
```

Uses `client.orders.create()`. Builds line items from `lines`. Sets `metadata: { cart_id: cartId }`. `reference_id: cartId` (Square caps at 40 chars; UUID v4 is 36 — fits). Returns the new order's id.

### 7.3 `src/lib/checkout/create-payment-link.ts`

```ts
export async function createPaymentLink(args: {
  orderId: string
  redirectUrl: string  // computed from NEXT_PUBLIC_SITE_URL + '/checkout/success'
}): Promise<{ checkoutUrl: string }>
```

Uses `client.checkout.paymentLinks.create({ orderId, checkoutOptions: { redirectUrl } })`. Returns the hosted URL.

### 7.4 `src/lib/webhooks/verify-signature.ts`

```ts
export function verifySquareSignature(args: {
  rawBody: string  // exact bytes Square sent — must NOT be re-stringified
  signatureHeader: string  // value of `x-square-hmacsha256-signature`
  notificationUrl: string  // exact URL Square called (env-derived)
  signatureKey: string  // SQUARE_WEBHOOK_SIGNATURE_KEY
}): boolean
```

HMAC-SHA256 of `notificationUrl + rawBody`, base64-encoded, compared with `signatureHeader`. Constant-time comparison via `crypto.timingSafeEqual`.

### 7.5 `src/lib/webhooks/handle-event.ts`

Dispatch logic for verified events. Calls into `abandoned-carts` queries, `order-log` queries, and notification senders. One function per event type (`handlePaymentCreated`, `handleFulfillmentUpdated`, `handleRefundCreated`). Idempotency check via `orderLog.hasEventId` before triggering notifications.

### 7.6 `src/lib/notifications/discord.ts`

```ts
export async function sendDiscordOrderNotification(args: {
  webhookUrl: string  // from DISCORD_ORDER_WEBHOOK_URL
  orderId: string
  totalCents: number
  itemCount: number
  buyerEmail: string | null
}): Promise<void>
```

POSTs a Discord embed. Never throws — caller-handled errors logged to console.

### 7.7 `src/lib/notifications/sms.ts`

```ts
export async function sendOrderSms(args: {
  recipient: { phone: string; label: string | null }
  orderId: string
  totalCents: number
  itemCount: number
}): Promise<void>
```

POSTs to `${SMSGATE_BASE_URL}/send` with Basic auth (`SMSGATE_USER:SMSGATE_PASS`). Message body: `"New order $XX.XX (N items) on animeniacs.shop — order ${orderId}"`. The wrapper function `notifyEnabledRecipients(args)` loops over `getEnabledRecipients()` and calls `sendOrderSms` for each, catching per-recipient errors.

### 7.8 `src/lib/db/queries/abandoned-carts.ts`

```ts
export async function createPendingCart(args: {
  cartId: string
  squareOrderId: string
  cartSnapshot: unknown
  buyerEmail: string | null
}): Promise<AbandonedCart>

export async function markCartCompleted(squareOrderId: string): Promise<void>
export async function markCartAbandoned(squareOrderId: string): Promise<void>
export async function getCartBySquareOrderId(squareOrderId: string): Promise<AbandonedCart | undefined>
```

### 7.9 `src/lib/db/queries/order-log.ts`

```ts
export async function appendOrderLog(args: {
  squareOrderId: string
  eventType: string
  eventId: string  // for idempotency
  payload: unknown
}): Promise<OrderLogEntry>

export async function hasEventId(eventId: string): Promise<boolean>
```

Note: `order_log` schema (Phase 2) has no `event_id` column. **Spec amendment:** add `event_id` as a nullable text column via a new migration (`0011_add_event_id_to_order_log.sql`). Index on `event_id` for fast idempotency lookups.

### 7.10 `src/lib/db/queries/sms-recipients.ts`

```ts
export async function getAllSmsRecipients(): Promise<SmsRecipient[]>
export async function getEnabledRecipients(): Promise<SmsRecipient[]>
export async function getSmsRecipientById(id: number): Promise<SmsRecipient | undefined>
export async function createSmsRecipient(input: SmsRecipientInput): Promise<SmsRecipient>
export async function updateSmsRecipient(id: number, input: Partial<SmsRecipientInput>): Promise<SmsRecipient>
export async function deleteSmsRecipient(id: number): Promise<void>
```

Zod input schema enforces E.164 phone format (`/^\+[1-9]\d{1,14}$/`). Note: this table uses an integer `id` (Phase 2 schema), not UUID — query helpers and the admin form's `[id]` param treat it as numeric.

## 8. API contracts

### 8.1 `POST /api/checkout`

```
Request:
{
  "items": [
    {
      "catalogItemId": "ITEM_ABC",
      "variationId": "VAR_XYZ",
      "quantity": 2,
      "expectedUnitPriceCents": 2500
    }
  ]
}

200 OK:
{
  "checkoutUrl": "https://sandbox.squareup.com/checkout/<...>",
  "cartId": "<uuid>"
}

400 Bad Request:    { "error": "Invalid request body." }
409 Conflict:       { "error": "price_changed", "mismatches": [...] }
500 Internal:       { "error": "Could not start checkout. Please try again." }
                    (Square API failures, DB failures — buyer-friendly message; details logged server-side)
```

### 8.2 `POST /api/webhooks/square`

```
Headers:
  x-square-hmacsha256-signature: <base64-encoded HMAC-SHA256>
  Content-Type: application/json

Body (Square event payload):
{
  "merchant_id": "...",
  "type": "payment.created",
  "event_id": "<uuid>",
  "created_at": "...",
  "data": { "object": { "payment": { ... } } }
}

200 OK: <empty body>
401 Unauthorized: <empty body>  (signature mismatch)
400 Bad Request: <empty body>   (unparseable body)
500 Internal: <empty body>      (DB write failed — Square will retry)
```

We never echo Square's payload back. Always empty body responses.

## 9. Admin UI — `/admin/sms-recipients`

Three-route CRUD mirroring `/admin/artists` and `/admin/ip-nicknames` exactly.

### 9.1 List page

| Column | Source |
|---|---|
| Enabled | green badge if `enabled=true`, gray if false |
| Label | `label` (e.g. "Owner", "Manager") |
| Phone | `phone` in mono font |
| Created | `createdAt` formatted |
| — | edit link / delete button |

Header: `+ new recipient` link. Empty state mirrors siblings.

### 9.2 New / Edit form

Mode-aware (`create` | `edit`). Phone is read-only in edit mode (id-like; changing it would break notification audit trails).

Fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| Phone | `<input type="tel" pattern="^\+[1-9]\d{1,14}$">` | yes | E.164. Phone is identity. |
| Label | `<input type="text">` | no | Free-form, max 60 chars. |
| Enabled | radio: Enabled / Disabled | yes | Default Enabled on create. |

Server actions follow the artists/ip-nicknames pattern. Unique-violation on phone → field error.

### 9.3 Delete

A small delete button in the list row (form-action with confirmation). Hard-deletes the row. Different from artists/ip-nicknames (which used soft-delete via status/isPublic flags) — sms_recipients is operator-internal data, no public references, hard delete is fine.

## 10. Cart drawer Checkout-button wiring

Replace Phase 6's `<button disabled title={DISABLED_CHECKOUT_TOOLTIP}>` with a live button:

```tsx
const [isCheckingOut, setIsCheckingOut] = useState(false)
const [error, setError] = useState<string | null>(null)

async function handleCheckout() {
  if (items.length === 0) return
  setIsCheckingOut(true)
  setError(null)
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(e => ({
          catalogItemId: e.catalogItemId,
          variationId: e.variationId,
          quantity: e.quantity,
          // Look up current unit price from the hydrated products map.
          expectedUnitPriceCents: lookupPriceCents(products, e),
        })),
      }),
    })
    if (res.status === 409) {
      const body = await res.json()
      setError('Some prices have changed. Please review your cart.')
      // Trigger refresh() to re-hydrate; user sees the updated prices.
      refresh()
      return
    }
    if (!res.ok) {
      setError('Could not start checkout. Please try again.')
      return
    }
    const { checkoutUrl } = await res.json()
    window.location.href = checkoutUrl
  } catch {
    setError('Network error. Please try again.')
  } finally {
    setIsCheckingOut(false)
  }
}
```

Render:
- Button enabled when `items.length > 0 && !isCheckingOut`.
- Button text: "Checkout" normally, "Starting checkout…" while in flight.
- Disabled visual state when empty cart.
- Error rendered as a `<p role="alert">` above the button when present.

`DISABLED_CHECKOUT_TOOLTIP` is deleted from `site-copy.ts`. The hint `<small>` below the button is removed.

## 11. Environment variables

| Var | Status | Required for |
|---|---|---|
| `SQUARE_ENV` | exists; `sandbox` | All Square calls |
| `SQUARE_ACCESS_TOKEN` | exists (sandbox) | All Square calls |
| `SQUARE_LOCATION_ID` | exists (sandbox) | Order creation |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | **EMPTY — operator sets** | Webhook signature verification |
| `NEXT_PUBLIC_SITE_URL` | exists (`http://localhost:3000`); needs production-style value on `dev.animeniacs.shop` and prod | Payment-link `redirectUrl` |
| `DISCORD_ORDER_WEBHOOK_URL` | **NOT IN .env.local — operator sets** | Discord notification |
| `SMSGATE_USER` | **NOT IN .env.local — operator sets** | SMS auth |
| `SMSGATE_PASS` | **NOT IN .env.local — operator sets** | SMS auth |
| `SMSGATE_BASE_URL` | exists in .env.example as `https://sms.relentnet.dev` | SMS endpoint |

Operator-side setup checklist (documented in plan):

1. Square sandbox dashboard → Webhooks → Add Subscription
   - URL: `https://dev.animeniacs.shop/api/webhooks/square`
   - Events: `payment.created`, `order.fulfillment.updated`, `refund.created`
   - Copy the signature key → `.env.local` AND Coolify env
2. Discord channel → Integrations → Webhooks → New Webhook
   - Copy URL → `.env.local` AND Coolify env
3. Reuse `sms-edge` credentials from existing project that uses it
   - Set `SMSGATE_USER`, `SMSGATE_PASS`, `SMSGATE_BASE_URL` in `.env.local` AND Coolify env
4. `pnpm db:migrate` to apply the new `event_id` column on `order_log`.
5. Deploy to Coolify dev environment, verify env vars copy through, smoke per acceptance criteria.

## 12. Testing strategy

Continues Phases 4/5/6 discipline. No new test frameworks.

### 12.1 Unit (~62 new + ~3 modified)

Per the file table in §5. Each `tests/checkout/*`, `tests/webhooks/*`, `tests/notifications/*`, `tests/admin/sms-recipients-actions.test.ts`, `tests/api/checkout.test.ts`, `tests/api/webhooks-square.test.ts`, `tests/public/checkout-success-page.test.tsx`. `tests/cart/cart-drawer.test.tsx` rewrites the Checkout-button assertions (button is now live; checks loading state, 409 handling, error display, redirect on success).

### 12.2 Integration (~20 new)

`tests/integration/abandoned-carts.integration.test.ts`, `tests/integration/order-log.integration.test.ts`, `tests/integration/sms-recipients.integration.test.ts`. Real Postgres per Phase 4/5 pattern.

### 12.3 Manual smoke (operator-run, on `dev.animeniacs.shop`)

Per §4 acceptance criteria. Specifically requires:
- Setting up the 3 new env vars in Coolify before deploying.
- Creating the Square sandbox webhook subscription pointing at the deployed URL.
- Adding the operator's own phone number to `sms_recipients` for the SMS verification step (removable after).
- Verifying the dashboard order in Square sandbox shows the test payment.

### 12.4 Pre-tag acceptance gate

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
grep -rn "goaffpro\|GoAffPro" src/ tests/   # must be zero
```

Expected counts: unit 191 → ~255, integration 55 → ~75.

## 13. What's NOT in Phase 7 (deferred to Phase 8+)

- Promo bar + `/admin/settings`.
- Abandoned-cart reminder emails (Resend).
- Wishlist UI.
- Reviews UI.
- Recently-viewed strip.
- IP cover image uploads.
- PDP upsells.
- `/shop` listing page.
- Footer / nav links to `/category/[slug]`.
- "View My Orders" account page.
- Refund-notification UX (webhook captures the event; no notification fan-out yet).
- `pnpm square:sync` backfill script.

## End of spec.
