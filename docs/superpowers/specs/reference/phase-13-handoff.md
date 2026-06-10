# Phase 13 → Phase 14 hand-off

**Status:** Phase 13 **code-complete**. Order-lifecycle completeness shipped in 9
tasks: refund reflection (status + `refundedCents`, server-computed from the
authoritative Square order), order-confirmation + refund emails (Resend,
env-gated), fulfillment-state tracking (capture at record time + on
`order.fulfillment.updated`), a shared `OrderDetailView`, fulfillment display on
the account pages, and a public **guest order lookup** at `/orders/lookup`
(email + order number, generic-error-only). All automated **code** gates green
(scoped lint / typecheck / unit / canary / unreachable-DB build). Tag
`phase-13-order-lifecycle` applied at the final commit. Deploy triggered via
`./scripts/deploy.sh`.

**Date:** 2026-06-10

> **Read me first, master orchestrator:** the refund/fulfillment/email/guest-lookup
> features are **live on deploy**, but operator steps gate real-world use (§9, do
> NOT block): (1) **Resend must be configured** (`RESEND_API_KEY` +
> `RESEND_FROM_EMAIL`) for receipt/refund emails to actually send — same pending
> item as Phase 10; until then they silently no-op; (2) the **`0014` migration**
> (`orders.fulfillment_state` + `orders.refunded_cents`) must apply on deploy / in
> CI (no local Postgres in the exec env); (3) **fulfillment state only advances if
> the operator updates fulfillment in Square**; (4) the **sandbox verify
> checklist**. `SQUARE_ENV` stays `sandbox`; no prod cutover. goaffpro canary
> stays **0**. **No new env vars or secrets** were added this phase (Resend vars
> already exist from Phase 10). Integration tests were **not run locally** (no
> Postgres/Docker; `ECONNREFUSED :5433`) — but **zero integration tests were added
> or modified**, so the suite is structurally unchanged at the Phase 11 baseline
> (75). Run them in CI / against a live DB before relying on them.

---

## 1. TL;DR

Phase 13 completes the orders system end-to-end:

- **Refund reflection** — `refund.created` / `refund.updated` now flip
  `orders.status` to `refunded` / `partially_refunded` and record
  `refundedCents`. The amount **and** the full-vs-partial decision are
  **server-computed from the authoritative Square order** (`orders.get` → sum
  `refunds[].amountMoney`), never from the raw webhook payload.
- **Order confirmation + refund emails** — `sendOrderConfirmationEmail`
  (on `payment.created`, after recording) + `sendRefundEmail` (on refund),
  mirroring Phase 10's `sendAbandonedCartEmail` env-gate + silent no-op.
- **Fulfillment tracking** — `orders.fulfillmentState` captured from the Square
  order at record time (most-advanced of `fulfillments[].state`) and updated on
  `order.fulfillment.updated`. A friendly customer label shows on order pages.
- **Guest order lookup** — public `/orders/lookup`: email + order number →
  read-only `OrderDetailView`. Requires **both**; returns a single **generic**
  error for any mismatch (no field-level disclosure).
- **DRY refactor** — the account order-detail markup was extracted into a shared
  `OrderDetailView`, reused by both the account detail page and the guest result.

**Schema:** 2 additive changes (`orders.fulfillment_state` text nullable;
`orders.refunded_cents` integer notNull default 0) → migration
`0014_mighty_goblin_queen.sql`. **Env:** **no changes**. **Tests:** +46 unit
(398 → **444**; 75 → **79** files). Integration **unchanged** (0 added/modified;
not run locally).

---

## 2. Required reading order

1. **This doc** (`phase-13-handoff.md`).
2. **`phase-12-handoff.md`** — reviews/wishlist; the orders read model + verified
   purchase queries that live alongside the new ones in `orders.ts`.
3. **`phase-11-handoff.md`** — orders read model, Logto↔Square mapping, the
   attribution bridge, the `(account)` group + IDOR guard, Square SDK reference.
4. **`phase-10-handoff.md`** — Resend integration (the env-gate pattern these
   emails reuse), durable uploads, `corepack pnpm` build note, Windows EPERM quirk.
5. **`phase-09-handoff.md`** — `scripts/deploy.sh` + the `force-dynamic`
   post-mortem (still in force).
6. **Phase 13 plan + spec:**
   `docs/superpowers/plans/2026-06-10-phase-13-order-lifecycle.md` +
   `docs/superpowers/specs/2026-06-10-phase-13-order-lifecycle-design.md`.

---

## 3. What Phase 13 shipped (file-by-file)

| Task | Commit | Files | Change |
|---|---|---|---|
| 1 — schema | `6a603b5` | `src/lib/db/schema.ts`, `drizzle/migrations/0014_mighty_goblin_queen.sql` (+ snapshot/journal) | Add `fulfillmentState text('fulfillment_state')` (nullable) + `refundedCents integer('refunded_cents').notNull().default(0)` to `orders`. Two `ADD COLUMN`. |
| 2 — build-order | `cfa3623` | `src/lib/orders/build-order.ts`, `tests/orders/build-order.test.ts` (extend) | NEW exported `mostAdvancedFulfillmentState(fulfillments)` (rank PROPOSED<RESERVED<PREPARED<COMPLETED; CANCELED/FAILED off-path). `buildOrder` sets `fulfillmentState` from it; `refundedCents` left to the DB default (not set at creation). |
| 3 — orders queries | `4ba6f5c` | `src/lib/db/queries/orders.ts`, `tests/db/orders.test.ts` (extend) | NEW `OrderStatus` type; `getOrderBySquareOrderId(id)`, `getOrderBySquareOrderIdAndEmail(id, email)` (case-insensitive `lower()`), `updateOrderStatus(id, status, refundedCents)`, `setOrderFulfillmentState(id, state)`. Added `fulfillmentState` to the `upsertOrder` `onConflictDoUpdate` set. `import 'server-only'`. |
| 4 — emails | `9c61623` | `src/lib/notifications/email.ts`, `tests/notifications/email.test.ts` (extend) | NEW `sendOrderConfirmationEmail({to,orderId,items,totalCents,shopUrl})` (receipt: item lines + total + `/account/orders` + `/orders/lookup` links) + `sendRefundEmail({to,orderId,refundedCents,totalCents,shopUrl})`. Both reuse the env-gate + `new Resend(apiKey)` + plain-text pattern; silent no-op when unconfigured. |
| 5 — labels | `e2b4cef` | `src/lib/orders/labels.ts` (NEW), `tests/orders/labels.test.ts` (NEW) | Pure `statusLabel(status)` + `fulfillmentLabel(state)` (PREPARED→"Being prepared", COMPLETED→"Shipped", null/unknown→"Processing"). Single source of truth for account + guest views. Type-only import of `OrderStatus` (erased; usable client-side). |
| 6 — webhook | `ce7828d` | `src/lib/webhooks/handle-event.ts`, `tests/webhooks/handle-event.test.ts` (extend) | Replaced the `!== 'payment.created'` short-circuit with type routing into extracted `handlePaymentCreated` / `handleRefund` / `handleFulfillmentUpdated`, each best-effort (try/catch). Payment path sends the confirmation email after `upsertOrder` (when a buyer email is known). Refund path computes status/amount from `orders.get`. Fulfillment path reads the most-advanced state from `orders.get`. New `extractOrderId` branch for `order.fulfillment.updated`. |
| 7 — OrderDetailView | `66cc88d` | `src/components/orders/OrderDetailView.tsx` (NEW), `src/app/(account)/account/orders/[id]/page.tsx` + `…/orders/page.tsx` (modify), `tests/orders/order-detail-view.test.tsx` (NEW) | Extracted the read-only order markup into a presentational `OrderDetailView` (status + fulfillment labels, total, "Refunded $X of $Y" when `refundedCents>0`, line items). Detail page keeps the **unchanged IDOR guard**, then renders it. List page shows `statusLabel` + `fulfillmentLabel`. |
| 8 — guest lookup | `62cb477` | `src/app/orders/lookup/page.tsx` + `LookupForm.tsx` + `actions.ts` (NEW), `src/app/checkout/success/page.tsx` (modify), `tests/orders/lookup-action.test.ts` + `lookup-page.test.tsx` (NEW) | `lookupOrderAction` (`'use server'`): normalize email (trim+lowercase) + order number (trim) → `getOrderBySquareOrderIdAndEmail` → `{ok,order}` or a single `GENERIC_ERROR`. `LookupForm` (`'use client'`, `useFormState`, Tailwind) renders inputs / generic error / `OrderDetailView`. Page is public (NOT under `(account)`), `force-dynamic`. Success page now shows the order number prominently + a `/orders/lookup` hint. |
| 9 — verify/handoff | `4a5c417` (+ this doc) | scoped `biome check --write` on the 21 Phase-13 files | Formatting only (line-wrapping; removed unused `noExplicitAny` suppressions). No unrelated files touched (committed blobs LF; CI passes). |

---

## 4. Webhook event routing (the load-bearing change)

`handleSquareEvent` keeps the idempotency guard (`order_log.eventId` /
`hasEventId`) + `appendOrderLog` **unchanged**, then routes by `event.type`:

- **`payment.created`** → `handlePaymentCreated`: existing markCartCompleted +
  Discord + SMS + `buildOrder`/`upsertOrder`, **then NEW** best-effort
  `sendOrderConfirmationEmail` (reusing the built order's line items) when a buyer
  email is known.
- **`refund.*`** → `handleRefund`: `orders.get` → `refundedCents =
  Σ refunds[].amountMoney.amount`; `status = refundedCents >= totalMoney && total>0
  ? 'refunded' : 'partially_refunded'`; `updateOrderStatus`; best-effort
  `sendRefundEmail` (buyer email read from our stored order row — identity only).
- **`order.fulfillment.updated`** → `handleFulfillmentUpdated`: `orders.get` →
  `mostAdvancedFulfillmentState(fulfillments)` → `setOrderFulfillmentState`.

**This is handler wiring only.** The webhook already routed `refund.created` and
`order.fulfillment.updated` subscriptions (live since Phase 7.5) — no Square
dashboard change. Each helper owns its own try/catch; a failure in any side
effect logs and continues, **never throws out of `handleSquareEvent`**.

---

## 5. Security / correctness invariants (verified)

- **Refund status/amount are server-computed.** `refundedCents` and the
  full-vs-partial decision come from `orders.get` (`totalMoney` + summed
  `refunds[].amountMoney`), never from the webhook payload. Covered by
  *"refund status/amount come from the Square order, not the webhook payload"*
  (a payload claiming a 999999 refund still yields the authoritative 500).
- **Guest lookup requires BOTH** a matching `buyerEmail` (case-insensitive
  `lower()`) **AND** the exact `squareOrderId`. Every failure path — wrong email,
  wrong number, or a missing field — returns the **identical** generic message
  (`"We couldn't find an order matching that email and order number."`). Covered
  by *"the wrong-email and wrong-number errors are identical (no field
  disclosure)"*. Rate-limiting is a documented Phase 14 follow-up (not built).
- **The account IDOR guard is unchanged.** `/account/orders/[id]` still
  `notFound()`s (404) unless `order.userId === user.userId`. The
  `tests/account/order-detail.test.tsx` regression (incl. the SECURITY case)
  **passes**. The guest lookup is a separate, email+number-gated read path.
- **All webhook side effects are best-effort** — every handler wrapped in
  try/catch. Covered: throwing confirmation email, throwing refund email, throwing
  fulfillment update, and the duplicate-event short-circuit all resolve without
  throwing.
- **Emails are env-gated** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`) and no-op
  silently when unconfigured.
- `SQUARE_ENV=sandbox`; goaffpro canary **0**; deploy via `./scripts/deploy.sh`
  only; **no new env vars**. Pages dynamic (root layout `force-dynamic`;
  `/orders/lookup` also `force-dynamic`).

---

## 6. Schema change + migration

Migration `drizzle/migrations/0014_mighty_goblin_queen.sql`:

```sql
ALTER TABLE "orders" ADD COLUMN "fulfillment_state" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;
```

Two additive columns — low risk, no data backfill. **Not applied locally** (no
Postgres on `:5433` / no Docker in the exec env, same as Phase 10/11/12). The
migration + drizzle snapshot/journal were generated and the SQL verified.
**Apply on deploy / in CI.**

---

## 7. Verification state at handoff

**Automated code gate (local, via `corepack pnpm`):**
- **Lint:** repo-wide `pnpm lint` (`biome check .`) is red on pre-existing CRLF
  files locally (Phase 10 deviation 9). The **21 Phase-13 changed files pass
  `biome check` cleanly** (verified by scoping after the formatting commit;
  committed blobs are LF; CI Linux lint passes).
- **Typecheck:** `pnpm typecheck` (tsc --noEmit) → **clean (exit 0)**.
- **Unit tests:** `pnpm test` → **444 passed** (79 files) — up from 398 (+46:
  4 build-order + 7 orders-queries + 6 email + 5 labels + 11 webhook +
  4 order-detail-view + 6 lookup-action + 3 lookup-page).
- **Integration tests:** **NOT run** (no Postgres/Docker locally;
  `ECONNREFUSED :5433`). **Zero integration tests added or modified** this phase,
  so the suite is structurally unchanged at the Phase 11 baseline (**75**).
  **Do not claim integration green until run** against a live DB / in CI.
- **Canary:** `grep -rn "goaffpro\|GoAffPro" src/ tests/` → **0**.
- **Production build, unreachable DB:**
  `DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build`
  → **✓ Compiled successfully**, **✓ Generating static pages (39/39)** (was 38;
  +1 for `/orders/lookup`), **0 `ENOTFOUND`/`ECONNREFUSED`**. `/orders/lookup`
  compiled (`.next/server/app/orders/lookup/page.js`) with **no prerendered
  `.html`** (confirms dynamic). Exits 1 **only** on the Windows-specific
  `EPERM: symlink` in the `output: standalone` copy step (Phase 10 quirk) —
  **after** a successful compile + page generation. **On the Linux Docker builder
  Coolify uses, this exits 0.**

**Deploy:** `./scripts/deploy.sh` run at close of phase (push `main` + forced
Coolify deploy of the tagged commit `phase-13-order-lifecycle`).

---

## 8. Plan deviations

1. **Required sub-skill unavailable.** `superpowers:subagent-driven-development`
   and `superpowers:executing-plans` are **not registered** in this exec
   environment (same as Phases 11–12, which also executed standard TDD). Worked
   the plan task-by-task with strict TDD (failing test → confirm fail → implement
   → confirm pass → commit per task) — the methodology the skill encodes.
2. **Discord refund ping not implemented.** The plan/spec §3 list a best-effort
   "Discord refund ping" alongside `sendRefundEmail`. The existing
   `sendDiscordOrderNotification` hardcodes a *"New order"* embed title, so
   reusing it for refunds would mislabel the channel; a proper refund-specific
   Discord template is out of this phase's scope. The customer-facing refund
   **email** is sent; all spec invariants (server-computed status, best-effort,
   never throws, env-gated) hold. **Deferred to Phase 14** (see §11).
3. **Migration named `0014_mighty_goblin_queen.sql`** (the plan didn't pin a
   number). Exactly the two expected `ADD COLUMN`s; no hand-editing.
4. **Refund buyer-email source.** The refund email's recipient is read from our
   stored `orders` row (`getOrderBySquareOrderId().buyerEmail`) — identity only;
   the amounts remain server-computed from the Square order per the invariant.
   The Square order isn't a reliable buyer-email source; our row (written at
   `payment.created`) is.
5. **`useFormState` test mock** for `LookupForm` (and the unused-suppression
   cleanup in the formatting commit) — same jsdom/SSR adaptation as the Phase 11
   account-page + Phase 12 review-form tests. Test-only.
6. **Lint via scoped `biome check`** rather than repo-wide `pnpm lint` (red on
   pre-existing CRLF files locally — Phase 10/11/12 deviation). Phase 13 changed
   set verified clean; committed blobs are LF; CI passes.
7. **Build run as `corepack pnpm content:build` + `corepack pnpm exec next build`**
   to bypass the `prebuild` bare-`pnpm` call — same as Phase 10/11/12. No code
   change.

---

## 9. Operator-pending items (DO NOT BLOCK — documented for follow-up)

1. **Configure Resend** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`, a verified
   sender) for receipt/refund emails to actually send — same pending item as
   Phase 10's abandoned-cart emails. Until then they no-op silently.
2. **Apply migration `0014` + run the integration suite against a live DB.**
   `docker compose --profile local up -d postgres` → `corepack pnpm db:push` (or
   migrate) → `corepack pnpm test:integration` (confirm the Phase 11 baseline of
   75 still passes; no Phase 13 integration tests were added).
3. **Fulfillment state only advances if the operator updates fulfillment in
   Square** — confirm the workflow, or the state sits at its initial value.
4. **Sandbox verify (spec §7):** complete a sandbox order → receipt email + an
   `orders` row with a fulfillment state; issue a sandbox refund → status flips to
   refunded/partially + a refund email sends; advance fulfillment in Square → the
   order page reflects it; place a **guest** (logged-out) order → look it up at
   `/orders/lookup` with the email + order number.
5. **No new env vars or secrets** — nothing to add in Coolify for this phase.
6. **Carried forward (still pending):** mount the `uploads-data` volume (Phase
   10/12); enable Logto self-registration (Phase 11); wire the abandoned-cart cron
   (Phase 10); Coolify Auto-Deploy + `/api/health` check (Phase 9).

---

## 10. Where credentials live

Phase 13 **sourced no new secrets and added zero env vars.** Locations unchanged
from Phase 11/12:
- **Local dev:** `.env.local` (gitignored). `scripts/deploy.sh` greps
  `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` from it at runtime.
- **Deployed (dev):** Coolify app `h4400cg04wg8www84ggks4sg` runtime env (Resend
  vars go here when configured — operator item §9.1).
- **Coolify API:** base `https://empower.relentnet.com`, app UUID
  `h4400cg04wg8www84ggks4sg`.
- **Leftover `GOAFFPRO_*` / `SQUARE_PROD_ACCESS_TOKEN`** in `.env.local` are
  expected + unused; goaffpro canary stays 0.

---

## 11. What's deferred / Phase 14+ candidates

**Newly deferred by Phase 13:**
- **Guest-lookup rate-limiting / lockout** — the lookup is generic-error-only but
  has no throttle; an attacker could brute-force order numbers for a known email.
  Add IP/email rate-limiting before this is high-traffic (spec §2/§6).
- **Discord refund ping** — a refund-specific Discord embed (see deviation §8.2);
  needs a small template (or a `title`/`kind` param on the Discord notifier).
- **SMS refund fanout** — refund emails ship; an SMS equivalent to the operators
  is not wired.
- **Full Square fulfillment management UI** — shipping labels, tracking numbers,
  advancing state from our admin (today the operator advances it in Square).
- **Partial-refund line-item detail** — we store the cumulative `refundedCents`,
  not which items were refunded.
- **`refund.updated` re-summing nuance** — each refund event re-reads `orders.get`
  and re-sums all `refunds[]`, so progressive/multiple refunds converge correctly;
  no per-refund dedup is needed (idempotency is per `event_id`).

**Carried forward (unchanged):** Square production cutover; monitoring/alerting,
CI/CD, automated DB backups; `/shop` pagination/search/filtering + per-card
rating summary; the `batchGet` 1000-object image cap; shared `ProductCard`;
review editing/replies/helpful-votes; profile name/email editing (Logto-owned);
the Phase 10 operator items (uploads volume, Resend cron).

---

## 12. How to verify this hand-off

```sh
git fetch --tags
git rev-parse phase-13-order-lifecycle
git checkout main && git pull

corepack pnpm install
corepack pnpm content:build                      # gitignored manifest
corepack pnpm typecheck                          # clean
corepack pnpm test                               # 444 passed (79 files)
grep -rn "goaffpro\|GoAffPro" src/ tests/        # 0

# Build proves /orders/lookup compiles + no build-time DB read
DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build
#   → "Compiled successfully", "Generating static pages (39/39)", 0 ENOTFOUND
#     (Linux exits 0; Windows stops at the standalone symlink step — EPERM)

# Operator-assisted (live, after deploy + Resend configured) — §9:
#   sandbox order → receipt email + orders row w/ fulfillment state;
#   sandbox refund → status flips + refund email; advance fulfillment in Square
#   → order page reflects it; guest order → /orders/lookup by email + number.
```
