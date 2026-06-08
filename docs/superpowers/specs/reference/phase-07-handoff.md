# Phase 7 → Phase 8 hand-off

**Status:** Phase 7 **code complete**. All automated gates green at
HEAD `38b9053` (this commit). Tag `phase-7-checkout` applied at this
commit. Manual sandbox smoke is **deferred to Phase 8 (or a Phase 7.5
first-deploy phase)** — see §"Deferred sandbox smoke" below for why
and what needs to happen.

This document is the source of truth for the next agent picking up
Phase 8. Read it end-to-end before opening code.

**Date:** 2026-05-29

> **Read me first, master orchestrator:** Phase 7 shipped the full
> checkout code path, but the master plan's Task G.3 manual smoke
> against `dev.animeniacs.shop` was deferred. The reason is structural,
> not a code bug: there is no `dev.animeniacs.shop` Coolify deployment
> yet — Phases 1–7 ran entirely locally. The first prod-style deploy
> is its own scope (migration runner, healthcheck wiring, env-var
> bootstrap, sandbox-Logto callback). Phase 8 brainstorm should choose
> whether to make this a Phase 7.5 first-deploy track OR fold it into
> the chosen Phase 8 feature. See §"Deferred sandbox smoke" for
> specifics + the four missing operator credentials.

---

## TL;DR

Phase 7 shipped the full payment loop end-to-end against Square
sandbox: cart drawer Checkout button → `POST /api/checkout`
(validates each line's price against live Square via Phase 5's
`getProductById`, rejects price drift > 1¢ with HTTP 409) → Square
"Order Checkout" call that atomically creates a Square Order AND
a hosted Payment Link in a single API call → `abandoned_carts` row
persisted with `status='pending'` and the Square-assigned `square_order_id`
→ buyer redirected to Square hosted checkout → returns to
`/checkout/success?orderId=…` (server-renders order details with a
generic-thanks fallback for missing/null/throw cases; fires Plausible
`checkout_completed` with revenue). In parallel,
`POST /api/webhooks/square` HMAC-SHA256-verifies Square's signature,
appends every event to `order_log` keyed by Square's `event_id` for
idempotency, and fans out Discord webhook + SMS-via-sms-edge
notifications on `payment.created`. Plus a full
`/admin/sms-recipients` CRUD area (list / new / edit / delete)
mirroring `/admin/ip-nicknames` for managing the SMS-fanout recipient
list. Sandbox-first throughout (Phase 4 hard constraint #6): every
Square write defaults to `SQUARE_ENV=sandbox`; production cutover is
a one-line env flip after the operator verifies sandbox smoke on
`dev.animeniacs.shop`.

What Phase 8 picks up: nothing locked. Strong candidates: (a) **first
prod-style deploy ("Phase 7.5") so the deferred sandbox smoke can run**
(see §"Deferred sandbox smoke" below); (b) the promo bar +
`/admin/settings` so the 20% promo can actually fire; (c) abandoned-
cart reminder emails via Resend, which the `abandoned_carts.status='pending'`
rows seeded by Phase 7 already enable; (d) refund-notification UX
(the webhook captures `refund.created` but doesn't fan out yet).
Don't lock — next master terminal brainstorm chooses, but should
consider whether to bundle the deploy bootstrap with the chosen
feature or run it as a standalone first-deploy track.

---

## Deferred sandbox smoke (Phase 7.5 candidate)

The Phase 7 plan's Task G.3 specified a 12-step manual smoke against
`https://dev.animeniacs.shop` against Square sandbox. **This was not
run.** The reason is structural: there is no `dev.animeniacs.shop`
Coolify deployment. Phases 1–7 ran entirely against `localhost`. The
master design doc §3 ("Migration from local → Coolify is just: push to
GitHub, point Coolify at the repo, set production env vars. Zero
compose edits.") was aspirational — the actual first deploy has never
been done.

### What's already in place (Phase 7 set this up)

- GitHub repo created at `https://github.com/itkujo/animeniacs-shop`
  (private). The local clone now tracks `origin/main`. Phase 7's
  commits + the handoff doc commit are all pushed.
- Coolify token works against the Animeniacs team (`team_id=15`). The
  `website` project (UUID `q4gso4kow0k08gowc4g40ww4`) lives in that
  team. Server `animaniacs-shared-host` (UUID `z0sg4ogw4ossg4880080ws8k`)
  is reachable.
- Project structure verified: production environment exists
  (UUID `ycw0w0ogcoc0gw8o4gw40oo0`); contains the `logto` service;
  contains zero applications. The Next.js app needs to be created
  as a new application in this environment.

### What needs to happen for the first deploy (Phase 7.5 task list)

1. **Decide on git source binding.** Three options:
   - **Coolify GH App** `helpless-hippopotamus-ogo0o4g0`
     (UUID `h0ws408gocw8c8ookw44sgoo`) — already configured at the
     Coolify level. May or may not have `itkujo/animeniacs-shop`
     installed. Verify via the Coolify dashboard or attempt to use
     it and see if the create call succeeds.
   - **Deploy key** — generate an SSH keypair in Coolify, add the
     public key to the repo's Deploy keys in GitHub.
   - **Public repo** — make `itkujo/animeniacs-shop` public. Lowest
     friction; the repo contains no secrets (all in `.env.local` /
     Coolify env, gitignored).
2. **Add a migration step** to the runtime. The current `Dockerfile`
   builds a Next.js standalone server (`CMD ["node", "server.js"]`)
   that lacks `pnpm` and `drizzle-kit`. Three options:
   - (a) Add an init container in `compose.yml` that runs
     `pnpm db:migrate` before `app` starts. Needs the deps stage's
     image preserved with pnpm + drizzle-kit. Most idiomatic.
   - (b) Extend the runtime image to include pnpm + drizzle-kit, and
     run `pnpm db:migrate && node server.js` as CMD. Larger image,
     simpler topology.
   - (c) Manual: after first deploy, exec into the Coolify app
     container shell and run migrations once. Skips migrations on
     subsequent deploys (acceptable since Phase 7 only adds one
     column; future phases would need re-runs).
3. **Create the Coolify application** via API or dashboard. Suggested
   payload (dockercompose build pack):
   ```json
   {
     "project_uuid": "q4gso4kow0k08gowc4g40ww4",
     "server_uuid": "z0sg4ogw4ossg4880080ws8k",
     "environment_uuid": "ycw0w0ogcoc0gw8o4gw40oo0",
     "git_repository": "https://github.com/itkujo/animeniacs-shop",
     "git_branch": "main",
     "build_pack": "dockercompose",
     "docker_compose_location": "/compose.yml",
     "ports_exposes": "3000",
     "domains": "https://dev.animeniacs.shop",
     "name": "animeniacs-shop-dev",
     "is_auto_deploy_enabled": true,
     "instant_deploy": false
   }
   ```
   Adapt if (1)'s choice differs from the default GH App. The endpoint
   varies: `/api/v1/applications/dockercompose` for public,
   `/api/v1/applications/private-github-app` for GH App, etc.
4. **Set the env vars** in Coolify. Inventory:
   - `DATABASE_URL` — Coolify-internal Postgres URL once the postgres
     service in `compose.yml` is provisioned. Reuse the
     `${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`
     pattern.
   - `NEXT_PUBLIC_SITE_URL=https://dev.animeniacs.shop` — critical;
     used for redirect URLs AND webhook signature verification.
   - `NODE_ENV=production`
   - `SQUARE_ENV=sandbox`
   - `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` — sandbox values from
     `.env.local`.
   - `SQUARE_WEBHOOK_SIGNATURE_KEY` — operator already has this; set
     in `.env.local`. Copy to Coolify.
   - `LOGTO_*` — sandbox Logto callback at `auth.animeniacs.shop`
     needs a new application registered with the redirect URL
     `https://dev.animeniacs.shop/callback`. New `LOGTO_APP_ID`
     + `LOGTO_APP_SECRET` for that registration.
   - `NEXT_PUBLIC_PLAUSIBLE_*` — copy from `.env.local`.
   - **THE FOUR PHASE 7 CREDENTIALS STILL MISSING from `.env.local`:**
     - `DISCORD_ORDER_WEBHOOK_URL` — operator to source from a Discord
       channel webhook (any channel for sandbox; operator may want a
       dedicated `#animeniacs-test-orders` channel).
     - `SMSGATE_USER` / `SMSGATE_PASS` / `SMSGATE_BASE_URL` — operator
       to reuse from the existing Smile NOLA / Court Command sms-edge
       deployment.
5. **Configure the Coolify Postgres** as part of the compose stack OR
   as a separate Coolify Postgres resource (recommended: separate, so
   it survives app redeploys without volume thrash).
6. **First deploy**. Use Coolify's "Force rebuild without cache" the
   first time and any time a stale-layer concern arises (per the
   global AGENTS.md "Coolify deploys — silent staleness" note).
7. **Verify the deploy is live**:
   ```sh
   curl -s https://dev.animeniacs.shop/api/health
   # expect: { "status": "ok" } or similar (per src/app/api/health/route.ts)
   curl -s -X POST https://dev.animeniacs.shop/api/checkout \
     -H 'Content-Type: application/json' \
     -d '{}'
   # expect: 400 + { "error": "Invalid request body." }
   curl -s -X POST https://dev.animeniacs.shop/api/webhooks/square \
     -H 'Content-Type: application/json' \
     -d '{}'
   # expect: 401 (no signature header)
   ```
8. **Create the Square sandbox webhook subscription** pointing at
   `https://dev.animeniacs.shop/api/webhooks/square` with events
   `payment.created`, `order.fulfillment.updated`, `refund.created`.
   Copy the new signature key into Coolify env, redeploy if needed.
9. **Run the 12-step smoke checklist** from
   `docs/superpowers/plans/2026-05-26-phase-07-checkout.md` Task G.3.

### Acceptance criteria for closing out the Phase 7 smoke deferral

- All 12 smoke steps green on `dev.animeniacs.shop`.
- Operator update to this handoff doc's "Verification state at handoff"
  section confirming smoke passed (with rough date + a one-line note).
- No additional code changes to the Phase 7 logic (any failures
  surface a Phase 7.5 fix-up commit, not a Phase 7 revision).

### Why this isn't blocking the `phase-7-checkout` tag

The full Phase 7 automated gate is green: lint, typecheck, 253 unit
tests, 75 integration tests, build clean, 36 routes wired, hard-
constraint canary clean, IP-leak regression clean. The code-quality
contract is satisfied. The sandbox smoke is end-to-end *verification*
against a live Square sandbox + a live Coolify deployment; it confirms
the integration boundaries work in practice, but its absence does not
indicate that the code is broken — it indicates the deployment doesn't
exist yet. Tagging the code commit unblocks Phase 8 planning; the
smoke can run independently as a Phase 7.5 follow-up.

---

## Required reading order

Before touching any code:

1. **This document** front-to-back.
2. `docs/superpowers/specs/reference/phase-06-handoff.md` — Phase 6
   closeout. Hard constraints in its §"Hard constraints (still in
   force)" all still active in Phase 7 + onward.
3. `docs/superpowers/specs/reference/phase-05-handoff.md` — Phase 5
   closeout. The IP-leak regression test pair is still in force.
4. `docs/superpowers/specs/reference/phase-04-handoff.md` — Phase 4
   closeout. The IP-never-public + GoAffPro retirement context.
5. `docs/superpowers/specs/2026-05-26-phase-07-checkout-design.md` —
   the approved Phase 7 spec. Note: master design doc §9 references
   GoAffPro in the checkout flow sketch — those references are
   IGNORED. Phase 7 reaffirms Phase 4's hard constraint #1.
6. `docs/superpowers/plans/2026-05-26-phase-07-checkout.md` — the
   execution plan we just ran. The "Plan deviations" section below
   captures everything that differed from the plan-as-written.
7. `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md` — the
   master design doc. §6 ("Cart & checkout & wishlist") is now fully
   shipped for cart + checkout; wishlist remains.
8. `docs/operations/credentials-inventory.md` — every credential,
   where it lives, end-of-project cleanup checklist. Phase 7 added
   three new credential slots (Square webhook signature key,
   Discord webhook URL, sms-edge basic-auth pair).

---

## What Phase 7 actually shipped

### Code

| File / area | What it does |
|---|---|
| `src/lib/db/schema.ts` | **MODIFIED.** Added `eventId text` (nullable) + `order_log_event_id_idx` index to the existing `orderLog` table. Idempotency support for the webhook handler. No other tables added. |
| `drizzle/migrations/0011_medical_spot.sql` | **NEW.** Migration generated by `pnpm db:generate` from the schema edit above. Adds the column + index. |
| `src/lib/db/queries/abandoned-carts.ts` | **NEW.** `createPendingCart`, `getCartBySquareOrderId`, `markCartCompleted`, `markCartAbandoned`. All operate against the Phase 2 `abandoned_carts` table. `markCart*` operations are idempotent. |
| `src/lib/db/queries/order-log.ts` | **NEW.** `appendOrderLog(input)` — writes one row per webhook delivery. `hasEventId(eventId)` — idempotency-check helper; returns false for empty strings to defend against degenerate eventIds. |
| `src/lib/db/queries/sms-recipients.ts` | **NEW.** `getAllSmsRecipients`, `getEnabledRecipients`, `getSmsRecipientById`, `createSmsRecipient`, `updateSmsRecipient`, `deleteSmsRecipient`. Exports `SmsRecipientInputSchema` — Zod schema enforcing E.164 phone format (`/^\+[1-9]\d{1,14}$/`) and 60-char label cap. |
| `src/lib/checkout/validate-cart.ts` | **NEW.** `validateCart(items)` re-fetches each cart line's current price via Phase 5's `getProductById`. Tolerates ±1¢ drift (rounding). Returns `{ ok: true, lines }` or `{ ok: false, mismatches }` — accumulates ALL mismatches, doesn't short-circuit. |
| `src/lib/checkout/create-payment-link.ts` | **NEW.** `createPaymentLink({ lines, cartId, locationId, redirectUrl })` — single Square SDK v44 call that creates the Order AND the Payment Link atomically (Square's "Order Checkout" pattern). Embeds the order body inline; reads `paymentLink.url` and `paymentLink.orderId` from the response. Uses `idempotencyKey=cartId` so retries don't double-create. **Note plan deviation #1 below — the plan called for a separate `createSquareOrder` module; that module was dropped.** |
| `src/lib/webhooks/verify-signature.ts` | **NEW.** `verifySquareSignature({ rawBody, signatureHeader, notificationUrl, signatureKey })`. HMAC-SHA256 of `notificationUrl + rawBody`, base64-encoded, constant-time compared via `crypto.timingSafeEqual` (guards against length-mismatch first). |
| `src/lib/webhooks/handle-event.ts` | **NEW.** `handleSquareEvent({ event, webhookUrl, signatureKey })` — main dispatcher. Pre-checks `hasEventId` (idempotency), always appends to `order_log`, returns early if already-seen, then on `payment.created` only: marks cart completed, computes itemCount from cart snapshot, totalCents + buyerEmail from event payload, fans out Discord (try/catch) + SMS (try/catch). Each downstream is wrapped so failure logs but doesn't bubble to the route handler. |
| `src/lib/notifications/discord.ts` | **NEW.** `sendDiscordOrderNotification({ webhookUrl, orderId, totalCents, itemCount, buyerEmail })`. POSTs an embed to Discord webhook URL. Never throws (caller-handled errors logged to console). |
| `src/lib/notifications/sms.ts` | **NEW.** `sendOrderSms({ recipient, orderId, totalCents, itemCount })` POSTs to `${SMSGATE_BASE_URL}/send` with Basic auth (`SMSGATE_USER:SMSGATE_PASS` base64). `notifyEnabledRecipients({ orderId, totalCents, itemCount })` fetches enabled recipients and `Promise.all`s `sendOrderSms` over them with individual try/catch wrappers so one failed recipient doesn't block others. Both helpers no-op silently when env vars are missing. |
| `src/app/api/checkout/route.ts` | **NEW.** `POST /api/checkout`. Zod-validated request body (items: 1–50). Reads `SQUARE_LOCATION_ID` + `NEXT_PUBLIC_SITE_URL`; 500s if either missing. Flow: `validateCart` → if mismatch, 409 with mismatches list. Else `randomUUID()` cartId → `createPaymentLink` (Square creates order + link atomically) → `createPendingCart` with the Square-assigned orderId → returns `{ checkoutUrl, cartId }` as 200. Generic 500 message on any throw. No GET handler. |
| `src/app/api/webhooks/square/route.ts` | **NEW.** `POST /api/webhooks/square`. Reads `SQUARE_WEBHOOK_SIGNATURE_KEY` + `NEXT_PUBLIC_SITE_URL`; 500s if either missing. Reads raw request body (`request.text()`), verifies signature against `${NEXT_PUBLIC_SITE_URL}/api/webhooks/square`, 401s on mismatch, 400s on unparseable JSON. Dispatches to `handleSquareEvent`. 500 on handler throw (so Square retries). Always returns empty body — never echoes Square payloads. |
| `src/components/cart/CartDrawer.tsx` | **MODIFIED.** Replaced the Phase 6 `<button disabled title={DISABLED_CHECKOUT_TOOLTIP}>` + hint `<small>` with a live `handleCheckout` async function. POSTs current cart to `/api/checkout`, redirects to `checkoutUrl` on 200, shows error banner via `<p role="alert">` on 409 / 500 / network failure. On 409 (price changed), calls `refresh()` from `useCartHydration` to re-pull product prices so the next render shows the updated prices. Drops `DISABLED_CHECKOUT_TOOLTIP` import. |
| `src/components/cart/CartDrawer.module.css` | **MODIFIED.** `.checkout` button now styled as an active CTA (dark bg, white text, pointer cursor); `.checkout:disabled` carries the gray look. Dropped `.checkoutHint`. Added `.checkoutError` (red `#b91c1c`, 0.875rem). |
| `src/lib/site-copy.ts` | **MODIFIED.** Removed `DISABLED_CHECKOUT_TOOLTIP` export + its JSDoc. Kept `PRODUCTION_TIME_TEXT` and the three `CART_BADGE_*` exports unchanged. |
| `src/app/checkout/success/page.tsx` | **NEW.** Async server component. Reads `?orderId=` from `searchParams`. Fetches order via `getSquareClient().orders.get({ orderId })`. Renders order id, line items (name × quantity + base price), grand total, with a `GenericThanks` fallback for missing orderId / null order / Square throw. Calls `markCartCompleted` (fire-and-forget — webhook will eventually flip status if this fails). Fires Plausible `checkout_completed` event via `next/script` with revenue in cents. |
| `src/app/checkout/success/loading.tsx` | **NEW.** Three pulsing skeleton bars. |
| `src/app/checkout/success/error.tsx` | **NEW.** `'use client'` error boundary. Renders generic-thanks message + Reload button + collapsible details. |
| `src/app/(admin)/admin/sms-recipients/page.tsx` | **NEW.** List page. Columns: enabled (green/gray badge), label, phone (mono), createdAt, actions (edit link + inline delete `<form>`). Empty-state mirrors siblings. |
| `src/app/(admin)/admin/sms-recipients/new/page.tsx` + `actions.ts` | **NEW.** Create flow. `createSmsRecipientAction(prev, fd)`. Zod-validates input, translates `sms_recipients_phone_unique` constraint violation to a field error ("phone already used"), revalidates `/admin/sms-recipients`, redirects to list on success. |
| `src/app/(admin)/admin/sms-recipients/[id]/page.tsx` + `actions.ts` | **NEW.** Edit flow. `parseInt(params.id)` with NaN → `notFound()` guard at the page boundary. Phone is `readOnly` in edit mode (notification audit-trail invariant). Exports `updateSmsRecipientAction(id, prev, fd)` and `deleteSmsRecipientAction(id)` — delete revalidates and `redirect`s back to the list. |
| `src/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm.tsx` + `formData.ts` + `validation.ts` | **NEW.** Mode-aware (create / edit) form with phone (tel input, E.164 pattern), label (text, max 60), enabled (radio). `useFormState` (matches react-dom 18.3.1 pattern of `/admin/ip-nicknames`). `validation.ts` re-exports `SmsRecipientInputSchema` from the queries module and provides the unique-constraint translator. |
| `scripts/square-cleanup/unarchive-graveyard-skus.ts` | **MODIFIED (minor).** Replaced two unused `// biome-ignore lint/suspicious/noExplicitAny` suppressions with a typed `CatalogObject[]` cast to keep `pnpm lint` warning-free. Pre-Phase-7 code (commit `aa24aa3`); fix bundled with Phase 7 to make the final gate clean. |

### Tests added

- **Unit (+62 from baseline 191 = 253):**
  - `tests/checkout/validate-cart.test.ts` — 6 tests (Group B)
  - `tests/checkout/create-payment-link.test.ts` — 6 tests (Group B; rewritten after SDK v44 fix)
  - `tests/webhooks/verify-signature.test.ts` — 5 tests (Group C)
  - `tests/webhooks/handle-event.test.ts` — 6 tests (Group C)
  - `tests/notifications/discord.test.ts` — 4 tests (Group C)
  - `tests/notifications/sms.test.ts` — 5 tests (Group C; one describe per function + one shared `notifyEnabledRecipients` describe)
  - `tests/api/checkout.test.ts` — 9 tests (Group D)
  - `tests/api/webhooks-square.test.ts` — 6 tests (Group D)
  - `tests/cart/cart-drawer.test.tsx` — 5 NEW cases added (1 disabled-tooltip case removed in Group E)
  - `tests/public/checkout-success-page.test.tsx` — 5 tests (Group E)
  - `tests/admin/sms-recipients-actions.test.ts` — 6 tests (Group F)
- **Integration (+20 from baseline 55 = 75):**
  - `tests/integration/abandoned-carts.integration.test.ts` — +8 new tests (appended to existing 3 Phase 2 baseline; new tests use a separate test namespace + afterAll cleanup)
  - `tests/integration/order-log.integration.test.ts` — +4 new tests (appended to existing 3)
  - `tests/integration/sms-recipients.integration.test.ts` — +8 new tests (appended to existing 3)

Final test counts:
- **Unit:** 253 (191 baseline + 62 new)
- **Integration:** 75 (55 baseline + 20 new)

### Infrastructure

No changes. Postgres, Coolify-hosted Logto + Plausible, all unchanged
from Phase 6. `compose.yml` still runs `app` + `postgres` only.

### Database

One nullable column + one index on `order_log`. No new tables, no
deletions, no constraint changes elsewhere.

- **Row counts at handoff:** 15 active artists, 0 `ip_nicknames`,
  0 `sms_recipients` (operator hasn't seeded any rows yet — fine;
  the admin CRUD page works against an empty list and shows the
  empty state).

### Operational

Three new credential slots in `.env.local` (also Coolify env for any
deployment that should accept webhooks or fan out notifications):

- `SQUARE_WEBHOOK_SIGNATURE_KEY` — from the Square sandbox dashboard
  webhook subscription pointing at
  `https://dev.animeniacs.shop/api/webhooks/square`. Required for
  webhook signature verification. Without it, the webhook route 500s
  before processing.
- `DISCORD_ORDER_WEBHOOK_URL` — from the Discord channel's webhook
  integration. Required for Discord fan-out on `payment.created`.
  If absent, the webhook handler silently skips Discord (no throw,
  no log noise beyond the missing-env-vars line in console).
- `SMSGATE_USER` / `SMSGATE_PASS` / `SMSGATE_BASE_URL` — reuse from
  existing project (Smile NOLA / Court Command per Phase 4 handoff).
  Required for SMS fan-out. If absent, `sendOrderSms` logs
  "[sms] missing SMSGATE_* env vars; skipping send" and no-ops.

The Square sandbox webhook subscription must be created in the Square
sandbox dashboard with all three event types: `payment.created`,
`order.fulfillment.updated`, `refund.created`.

---

## Plan deviations Phase 8 should know about

### 1. Square SDK v44: Order + Payment Link collapsed into one call

The plan's Task B.2 / B.3 / D.1 assumed Square's Checkout API works in
two calls:
1. `client.orders.create(...)` → returns an orderId
2. `client.checkout.paymentLinks.create({ orderId, checkoutOptions: { redirectUrl } })`

This is wrong for the actual Square SDK v44 shipped in this repo.
`CreatePaymentLinkRequest` (`node_modules/square/api/resources/checkout/resources/paymentLinks/client/requests/CreatePaymentLinkRequest.d.ts`)
only accepts `quickPay` OR `order` (a full order body), never a
top-level `orderId`. The intended Square pattern is "Order Checkout":
submit the order body inline to `paymentLinks.create`, Square creates
the Order AND the Payment Link atomically, response includes
`paymentLink.orderId` as the Square-assigned id.

**Resolution (operator-approved):** Merged B.2 + B.3 into a single
`createPaymentLink({ lines, cartId, locationId, redirectUrl })` that
embeds the order body inline and returns
`{ checkoutUrl, orderId }`. Dropped `src/lib/checkout/create-order.ts`
and its tests. D.1's flow became:
```
validateCart → createPaymentLink (atomic) → createPendingCart (with the orderId)
```
not the plan's
```
validateCart → createSquareOrder → createPendingCart → createPaymentLink
```
Idempotency semantics also shifted: previously two separate
idempotency boundaries (`orders.create` + `paymentLinks.create`);
now one. Same `idempotencyKey=cartId`. On retry, Square returns the
cached prior result with the same `paymentLink.url` and `orderId` —
the desired behavior per Square's idempotency docs. Worth verifying
in sandbox during prod cutover. The plan + spec docs were NOT
updated; this handoff is the source of truth for the new shape.
Commit: `bafce0b`.

### 2. `vi.hoisted()` is mandatory for `vi.mock()` factory deps

The plan's snippets used the older non-hoisted mock pattern:
```ts
const mockFoo = vi.fn()
vi.mock('@/path', () => ({ foo: mockFoo }))
```
This fails in modern vitest with "Cannot access 'mockFoo' before
initialization" because `vi.mock(...)` calls are hoisted above
top-level `const` declarations. Every Phase 7 test file uses
`vi.hoisted()`:
```ts
const { mockFoo } = vi.hoisted(() => ({ mockFoo: vi.fn() }))
vi.mock('@/path', () => ({ foo: mockFoo }))
```
Apply this in any new test code in Phase 8. The existing
`tests/admin/ip-nicknames-actions.test.ts` uses a different (older)
pattern via `await importOriginal()` — that still works but is a
distinct pattern; the hoisted form is the Phase 7 standard.

### 3. `Response` constructor body/status guard in jsdom

The plan's Discord/SMS tests stubbed `fetch` responses with
`new Response('', { status: 204 })`. jsdom's `Response` constructor
rejects body for 204 / 205 / 304 (per spec). Phase 7's tests use
`status: 200` (semantically equivalent for our purposes — neither
code path branches on the response status; both are wrapped in
try/catch). If Phase 8 adds notification tests, use `status: 200`.

### 4. `window.location` redirect stubbing in jsdom

The plan's drawer-checkout-redirect test wanted to assign
`window.location.href` after stubbing `window.location`. jsdom doesn't
allow `delete window.location`. The Phase 7 pattern (in
`tests/cart/cart-drawer.test.tsx`):
```ts
let captured = ''
Object.defineProperty(window, 'location', {
  value: { get href() { return captured }, set href(v: string) { captured = v } },
  writable: true,
  configurable: true
})
// ...later...
await waitFor(() => expect(captured).toBe('https://expected/url'))
```

### 5. `next/script` mocked in success-page test

`next/script` doesn't import cleanly in jsdom (the script element it
renders requires actual document insertion). Phase 7's
`tests/public/checkout-success-page.test.tsx` mocks it to a no-op:
```ts
vi.mock('next/script', () => ({ default: () => null }))
```
Tests assert page structure, not Plausible behavior. Apply this
pattern when testing other server-rendered pages that include
`<Script>`.

### 6. Migration file landed at `0011_medical_spot.sql`

The plan implied a fresh `pnpm db:generate`. A previously-merged
branch (commit `a039eaf` from `opencode/gentle-cabin`, which is the
operator's hand-merged graveyard-unarchive script) had already applied
a migration named `0011_medical_spot.sql` to the local database with
hash `e339663b...`. The Phase 7/A subagent's initial `pnpm db:generate`
created `0011_broad_titanium_man.sql` with identical SQL and identical
hash but a different `when` timestamp, which made drizzle-kit try to
re-apply. Resolution: restored the existing branch's migration files
(same SQL, matching `when`) from `a039eaf`. The DB and tracked files
are now consistent.

### 7. Pre-existing typecheck error in Group B's first B.3 commit

Group B's initial B.3 commit (`492e6a9`) shipped a typecheck error
because the plan code used `client.checkout.paymentLinks.create({ orderId, … })`
which SDK v44 rejects (see deviation #1). The error was fixed in
commit `bafce0b`. If you `git bisect` between `492e6a9` and `bafce0b`,
typecheck will fail. The full Group B is green at `bafce0b` and
everything since.

### 8. Group C had a follow-up lint cleanup commit

Group C's biome auto-fixes for formatter reflow + import sort landed
in a separate small commit (`1016541`) rather than being amended into
the four C.1–C.4 commits. Per project policy: don't amend committed
history without explicit operator approval; ship the fix as a
follow-up. Five Group C commits total (C.1, C.2, C.3, C.4, lint
cleanup), four conceptual tasks.

### 9. Group F: `useFormState` (not `useActionState`)

React-dom 18.3.1 is the active version in this repo (matches Phase 6
+ `/admin/ip-nicknames` exactly). Phase 7/F uses `useFormState`
throughout. If React is upgraded later, this is the standard rename
to `useActionState`.

### 10. Group E: `.checkout` CSS got a real CTA look

The plan didn't specify the live button's visual style. Since it
transitioned from "permanently disabled-looking" to "live, sometimes
disabled," Phase 7 gave the enabled state a dark CTA appearance
(`#111` background, white text, pointer cursor) and kept the gray
disabled appearance via `.checkout:disabled`. If a future visual-
design pass wants to revise, the file is `src/components/cart/CartDrawer.module.css`.

### 11. `cartSnapshot` shape is `{ items: parsed.data.items }`

Group D's `/api/checkout` writes the cart snapshot as
`{ items: [...] }` (not the raw items array) so future Phase 8
abandoned-cart reminder emails can extend the snapshot with
buyer-typed fields (email, address) without changing the JSON
top-level type.

### 12. Idempotency check ordering: pre-check before append

Group C's `handleSquareEvent` does `hasEventId` BEFORE `appendOrderLog`,
not after. The plan's first sketch was muddled (it appended first and
then checked, which doesn't actually detect dupes since the just-
appended row counts). The clean version (which is what shipped) is:
1. `eventId = event.event_id ?? null`
2. `alreadySeen = eventId ? await hasEventId(eventId) : false`
3. `appendOrderLog({ … eventId, payload })` (always)
4. `if (alreadySeen) return` (skip fan-out)
5. `if (event.type !== 'payment.created') return`
6. fan out Discord + SMS

Result: every webhook delivery is logged (useful debugging surface
per locked decision #9 in the spec); fan-out fires at most once per
unique `event_id`.

---

## Hard constraints (still in force)

These come from Phase 4 + are reaffirmed by Phases 5 + 6 + 7. All
non-negotiable for every future phase. **Phase 7 introduced no new
constraints; it added new soft-rules (sandbox-first practice) that
should be respected through prod cutover.**

1. **No GoAffPro at runtime.** `grep -rn "goaffpro\|GoAffPro" src/ tests/`
   must return zero. The probe script under `scripts/goaffpro/probe.ts`
   is historical reference only.
2. **No `artist` Square custom attribute definition.** Artists resolve
   via the local `artists` table joined by `squareCategoryId`.
3. **No new auth vendors.** Reuse existing Logto + `(admin)` route
   group. Phase 7 added `/admin/sms-recipients` under this guard.
4. **No commission engine.** Manual monthly Square dashboard reporting.
5. **No additional Postgres tables for affiliate / commission tracking.**
   Phase 7 added zero tables (only the nullable `event_id` column +
   index on `order_log`).
6. **Sandbox-first for any production write.** Phase 7 wrote to
   sandbox throughout. Every Square SDK call defaults to
   `SQUARE_ENV=sandbox` per `src/lib/square/client.ts`. Production
   cutover is a one-line env flip after operator confirms sandbox
   smoke is green. **Phase 8 must continue to honor this.** If any
   new Square write surfaces, default it to sandbox; require operator
   to flip prod separately.
7. **IP categories never public via their literal Square name.** Two
   regression tests enforce this:
   - `tests/public/product-detail-page.test.tsx` asserts breadcrumbs =
     `Home / {name}` (no IP segment).
   - `tests/public/category-page.test.tsx` asserts the rendered DOM
     never contains `Anime` or `Naruto` (literal Square category names
     from the mocked `getCategoryNameMap`).
   Both must stay green. Don't disable; fix any leak that trips them.

---

## What's deferred (NOT Phase 7 scope, queued for Phase 8+)

| Item | Source | Likely phase |
|---|---|---|
| Promo bar (header alert strip) + `/admin/settings` page to edit | Master spec §10 / spec §1 non-goal | Phase 8 (strong candidate) |
| Abandoned-cart reminder emails via Resend | Master spec §6 / Phase 2 schema (the `abandoned_carts.status='pending'` rows seeded by Phase 7 already enable this) | Phase 8 (strong candidate; revenue lever) |
| Refund-notification UX (webhook captures `refund.created`; no fan-out yet) | Spec §6 / data-flow §6 | Phase 8 (smaller; completes event coverage) |
| Wishlist UI (Postgres + localStorage merge) | Master spec §6.2 | Phase 8+ |
| Reviews UI (read + write) | Master spec §7 | Phase 8+ |
| Recently-viewed strip (localStorage + server enrichment) | Master spec §8 | Phase 8+ |
| IP cover image uploads (`cover_image_url` already exists on `ip_nicknames`) | Phase 5 sub-decisions | Phase 8+ |
| PDP upsells (universal-upsells admin row) | Master spec §10 | Phase 8+ |
| `/shop` listing page + the middle breadcrumb segment | Master spec §5 (deferred) | Phase 8+ |
| Footer / nav links to `/category/[slug]` | Phase 5 decision: operator hand-shares URLs | Phase 8+ |
| `pnpm square:sync` backfill script | Phase 3 plan task 8 | Phase 8+ |
| "View My Orders" account page | Master spec §6 deferred | Phase 10+ (Logto-authenticated cart precondition) |
| Tax calculation (TaxJar) | Spec §1 non-goal | Phase 15+ |
| Buyer-email pre-fill (guest only in v1) | Spec §1 non-goal | Phase 10+ |

Phase 4 deferred items still standing (none changed in Phases 5–7):

| Item | Status | When |
|---|---|---|
| Plan C.3 — re-categorize the 229 production items into artist + IP categories in Square | Operator's dashboard task | Whenever. New IP nicknames + cache pick up changes within 60s (60s cache TTL on `getItemsByCategoryId`). |
| Avatar uploads per artist | Operator's task via admin UI | Whenever. |
| GoAffPro subscription cancellation | Operator's task in GoAffPro dashboard | Whenever. Runtime no longer reads from it. |
| Credentials cleanup sweep | Final phase | All Phase 4-era + Phase 7-era credentials in `.env.local` per operator's "defer to last phase" decision. See `docs/operations/credentials-inventory.md`. |

---

## Where credentials live

**TL;DR: every credential is in `.env.local` (gitignored) AND in
Coolify env for any deployment that uses it.** Inventory + cleanup
plan in `docs/operations/credentials-inventory.md`.

**Phase 7 added three new credential slots:**

- `SQUARE_WEBHOOK_SIGNATURE_KEY` (sandbox + prod)
  - Source: Square sandbox/prod dashboard → Webhooks → Add Subscription → Signature Key (one-time visible).
  - Sandbox URL: `https://dev.animeniacs.shop/api/webhooks/square`
  - Prod URL: `https://animeniacs.shop/api/webhooks/square` (set in cutover)
  - Required events: `payment.created`, `order.fulfillment.updated`, `refund.created`.
- `DISCORD_ORDER_WEBHOOK_URL`
  - Source: Discord channel → Edit Channel → Integrations → Webhooks → New Webhook.
  - Single value (one channel for sandbox + prod is fine; operator can split if desired).
- `SMSGATE_USER`, `SMSGATE_PASS`, `SMSGATE_BASE_URL`
  - Source: reuse from existing project that uses sms-edge (Smile NOLA / Court Command per Phase 4 handoff).
  - `SMSGATE_BASE_URL` default in `.env.example`: `https://sms.relentnet.dev`.

Phase 4-era credentials carry forward unchanged (Square sandbox +
prod access tokens, Square location IDs, Logto, Plausible). Phase 5
+ 6 added zero credentials.

Coolify resource UUIDs unchanged from Phase 4:
- Server `animaniacs-shared-host`: `z0sg4ogw4ossg4880080ws8k`
- Project `website` (where Logto lives): `q4gso4kow0k08gowc4g40ww4`

---

## Phase 8 scope (suggested, not locked)

The next master terminal brainstorm chooses. Strongest candidates,
in rough priority order:

1. **Promo bar + `/admin/settings` page** — Phase 7 explicitly
   deferred the 20% promo. Until `/admin/settings` ships, the operator
   can't run a promo from the admin UI. The promo bar is small (~3
   files: nav alert strip + admin form + Zod-backed settings table)
   and unblocks a meaningful merchandising lever.
2. **Abandoned-cart reminder emails via Resend** — Phase 7 seeds
   `abandoned_carts` rows with `status='pending'`. The path forward
   is a cron-driven scan + a Resend email template. Revenue lever:
   abandoned-cart recovery typically converts 10-30% of pending
   carts. Larger phase: needs Resend signup, template design, an
   "unsubscribe" path, a cron mechanism (Coolify Job or a Next.js
   route + external scheduler).
3. **Refund-notification UX** — smallest of the three. The webhook
   already captures `refund.created` events (they land in
   `order_log`); the handler just skips fan-out today. Add a Discord
   + SMS message variant for refunds. Touches `handle-event.ts`,
   `notifications/discord.ts`, `notifications/sms.ts`, no new
   credentials.

What Phase 8 should NOT scope (per master spec deferrals):
- Tax calculation (TaxJar — Phase 15+).
- Buyer-email pre-fill (Logto-authenticated cart precondition — Phase
  10+).
- Multi-currency support (spec §3 self-locked decision #6).

Don't lock from this list. Brainstorm decides.

---

## Verification state at handoff

**Automated gate (run locally, all green):**
- `pnpm lint`: clean (175 files, 0 errors, 0 warnings)
- `pnpm typecheck`: clean
- `pnpm test`: 253/253 passing (up from 191 baseline; **+62**)
- `pnpm test:integration`: 75/75 passing (up from 55 baseline; **+20**)
- `pnpm build`: clean. **36 routes total** (up from 30 in Phase 6):
  - 2 new API routes: `ƒ /api/checkout`, `ƒ /api/webhooks/square`
  - 1 new public route: `ƒ /checkout/success`
  - 3 new admin routes: `ƒ /admin/sms-recipients`,
    `ƒ /admin/sms-recipients/[id]`, `ƒ /admin/sms-recipients/new`
  - All other routes unchanged from Phase 6
- Hard-constraint canary clean: `grep -rn "goaffpro\|GoAffPro" src/ tests/` → zero.
- IP-leak regression tests: 14/14 passing.

**Git state:**
- Tag `phase-7-checkout` applied at this commit (the handoff doc
  commit; descendant of `df5aa16` which was the last Phase 7/E code
  commit).
- Origin set to `https://github.com/itkujo/animeniacs-shop` (private).
  Phase 7's commits pushed to `origin/main`.
- Phase 7 commit count: 24 commits from `phase-6-cart` tag to the
  tagged HEAD (`bafce0b` is the Group B SDK-fix; one operator commit
  `aa24aa3` / `466ad5a` for the graveyard-unarchive script landed
  alongside; `38b9053` is this handoff doc).

**Database state (local):**
- 15 active artist rows, 0 `ip_nicknames`, 0 `sms_recipients` rows.
- `order_log` has the new nullable `event_id` column + index; table
  is otherwise empty until first sandbox payment.

**Infrastructure state:**
- Coolify-hosted services healthy: Logto + Plausible. Unchanged.
- **NO `dev.animeniacs.shop` deployment exists** — see §"Deferred
  sandbox smoke" above.
- Production Square: 15 artist sub-categories, 30 graveyard SKUs
  archived. Unchanged from Phase 4 / 5 / 6.

**Sandbox smoke status:** **PASSED (2026-06-08, Phase 7.5).** The
Phase 7 plan's Task G.3 12-step manual smoke was run end-to-end against
the live `https://dev.animeniacs.shop` Coolify deployment provisioned
during Phase 7.5. All 12 steps verified green: product page → cart →
Square sandbox hosted checkout (test card `4111 1111 1111 1111`) →
`/checkout/success`; `abandoned_carts` row `status='completed'` with
populated `square_order_id`; `order_log` holds 63 `payment.created`
rows with distinct `event_id`s; Discord order embed delivered; SMS
delivered to enabled recipient via sms-edge; disable-recipient →
no SMS; re-enable → delete → row gone; Square sandbox shows the test
orders (location `L1T00JYXSKVM3`); `grep -rn "goaffpro" src/ tests/`
is zero and IP-leak regression tests pass. Four production bugs
surfaced and were fixed during the smoke (Logto reverse-proxy
`redirect_uri`, Logto secret rotation, missing Square webhook
subscription, sms-edge request-body contract) — see
`docs/superpowers/specs/reference/phase-07.5-handoff.md` for full
detail. The `phase-7-checkout` tag remains on the code; Phase 7.5
work is tagged `phase-7.5-first-deploy`.

---

## How to verify this hand-off is correct

Before starting Phase 8 work, the next agent should run:

```sh
# Confirm we're at the right commit
git describe --tags --abbrev=0       # → phase-7-checkout
git rev-parse --short HEAD            # → the tagged commit or a descendant

# Confirm green baseline
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration

# Confirm DB state
docker exec animeniacs-postgres psql -U animeniacs -d animeniacs \
  -c "SELECT count(*) FROM artists WHERE status='active';" \
  -c "SELECT count(*) FROM ip_nicknames;" \
  -c "SELECT count(*) FROM sms_recipients;" \
  -c "\d order_log"
# Should print: 15 artists, 0+ ip_nicknames, 0+ sms_recipients,
# and order_log should show event_id column + order_log_event_id_idx index.

# Confirm new routes are reachable (with dev server up)
curl -s -X POST http://localhost:3000/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"items":[]}'
# Should print: {"error":"Invalid request body."} (empty items array)

curl -s -X POST http://localhost:3000/api/webhooks/square \
  -H 'Content-Type: application/json' \
  -d '{}'
# Should print: empty body, status 401 (no signature)

# Confirm hard-constraint canary still clean
grep -rn "goaffpro\|GoAffPro" src/ tests/
# Should print: nothing.

# Confirm IP-leak regression tests still green
pnpm vitest run tests/public/product-detail-page.test.tsx tests/public/category-page.test.tsx
# Should print: 14 passing.

# Confirm production build still passes
pnpm build
# Should print: 36 routes total, including ƒ /api/checkout,
# ƒ /api/webhooks/square, ƒ /checkout/success, and the three
# admin/sms-recipients routes.
```

If any of those fail, stop and investigate before touching Phase 8
code. The baseline state is part of the contract.
