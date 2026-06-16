# Phase 17 → Phase 18 hand-off

**Status:** Phase 17 (admin order tooling) **implemented, gates green, deployed
to dev, and live-probed at the HTTP/route level.** The **money-path live
verification (a real sandbox refund + fulfillment push) is the one remaining
gate and is PENDING** — it needs the operator (admin sign-in + sandbox order).
**The `phase-17-admin-order-tooling` tag is intentionally HELD** until that
sandbox verification passes (more rigorous than Phase 16, because refunds move
money). Code is on `main` @ `5a6715e`, pushed + deployed to dev.

**Date:** 2026-06-16

> Master planned the phase (spec+plan), launched a background execution session
> for the code, **independently verified** its diff + gates, deployed to dev via
> `./scripts/deploy.sh`, and probed live. No schema changes → no migrations.
> `SQUARE_ENV` stays `sandbox`; goaffpro + logto canaries stay **0**.

---

## 1. TL;DR

A self-service admin order surface so the operator stops using the Square
dashboard day-to-day: **order list + detail + full-refund issuance + fulfillment
push + a small dashboard.** Both money/state actions call Square and let the
**existing** webhook reconcile the DB — no forked math. Operator decisions:
**refunds full-only**, **fulfillment pushes to Square**.

**Live on dev:** `/admin/orders` + `/admin/orders/[id]` return 307 anon (route
exists + gated); Phase 16 ISR intact (`/artist` still `s-maxage=300`, cache HIT).

## 2. What shipped (commit-by-commit, all on `main`)

| Commit | Task | Change |
|---|---|---|
| `ae11af3` | 1 | `listOrders` + `countOrders` (filters: status, fulfillment, `q` search on order#/email; pagination; limit capped 100). `q` is parameterized (Drizzle `sql` bind) — injection-safe. |
| `28e57e0` | 2 | `getOrderDashboardStats` — one-round-trip aggregate (orders + revenue today/7d/30d, refunded total, needs-fulfillment count). |
| `a8384ed` | 3 | Order list page `/admin/orders` + filters + pager + "Orders" entry on the admin index. |
| `5785a39` | 4 | Order detail page `/admin/orders/[id]` (read-only view; reuses `labels.ts`). |
| `1e3a587` | 5 | `src/lib/square/refunds.ts` (`issueFullRefund`) + `src/lib/square/fulfillment.ts` (`advanceFulfillment`), pinned to SDK v44. |
| `ace2325` | 6 | Refund action + `RefundPanel`; **extracted the webhook recompute into `src/lib/webhooks/reconcile.ts`** so the action + webhook share one source of math. |
| `c58966d` | 7 | `FulfillmentPanel` (push state to Square). |
| `e069dd9` | 8 | Dashboard stats strip on `/admin`. |
| `5a6715e` | — | Build-gate fix: split pure transition logic into `src/lib/orders/fulfillment-states.ts` (no `server-only`) so the client `FulfillmentPanel` can import it; `square/fulfillment.ts` re-exports. |

**Architecture note (load-bearing):** `src/lib/webhooks/reconcile.ts`
(`reconcileRefundFromSquare`, `reconcileFulfillmentFromSquare`) is now the single
source of refund/fulfillment math, called by BOTH `handle-event.ts` (webhooks)
and the admin actions. Admin actions call Square, then optimistically reconcile
via this shared path for immediate feedback; the webhook reconciles again
(idempotent) and **owns the buyer email** (so an admin-issued refund does not
double-send). Audit rows go to `order_log` with synthetic `eventType`
(`admin.refund.issued` / `admin.fulfillment.advanced`) + `eventId: null`.

## 3. Verification state

- **Gates (independently re-run by Master):** typecheck clean · **592 unit tests
  pass** (98 files; +53 from baseline 539) · unreachable-DB build = Compiled +
  **41/41** static pages + **0** ENOTFOUND/ECONNREFUSED, exit 0; new routes
  listed dynamic `ƒ /admin/orders`, `ƒ /admin/orders/[id]`. Canaries: logto 0,
  goaffpro 0.
- **Deploy:** `./scripts/deploy.sh` → deployment `y8s4cwcogowsw8kc800wc4ow`
  `finished`. Live probes: `/api/health`,`/`,`/shop`,`/artist`,`/sign-in`,
  `/orders/lookup` → 200; `/account`,`/admin`,`/admin/orders`,
  `/admin/orders/[id]` → 307 anon.
- **Sandbox de-risk (done at build time by the execution session):** a Square
  Checkout payment-link order **DOES carry a fulfillment** —
  `{ uid, type:'DIGITAL', state:'PROPOSED' }`, order `version:1`. So the
  "update existing fulfillment by uid" path is the real one. (That probe order
  was unpaid/DRAFT — P17-2 below re-confirms on a *paid* order.)
- **⚠️ PENDING — money-path live verification (operator):** see §6.

## 4. Plan deviations (all benign, documented)

1. **Extra commit `5a6715e`** — `server-only` import leaked into a client
   component via `square/fulfillment.ts`; fixed by extracting pure logic to
   `orders/fulfillment-states.ts`. No behavior change.
2. **`formatCents` not centralized** — the repo only has per-file copies; matched
   that convention with small local helpers rather than introducing a shared
   module. `statusLabel`/`fulfillmentLabel` ARE reused from `labels.ts`.
3. **Shared reconcile module** — instead of the action hand-writing the refund
   math, extracted the webhook's recompute into `reconcile.ts` and pointed both
   at it (strengthens "single source of math"). 21 existing webhook tests pass.

**Minor non-blockers (note for Phase 18):**
- In `issueRefundAction`, if the optimistic `reconcileRefundFromSquare` throws
  *after* Square's refund succeeds, the admin sees "Refund failed" though the
  money moved. The `refund.*` webhook still reconciles the DB, and the stable
  idempotency key (`refund_<squareOrderId>`) blocks a double-refund on retry —
  so it's a cosmetic/audit-gap only. Could treat post-refund reconcile failure
  as a soft success later.

## 5. Files added/changed (24 files, +2419/−43)

New: `src/lib/square/refunds.ts`, `src/lib/square/fulfillment.ts`,
`src/lib/orders/fulfillment-states.ts`, `src/lib/webhooks/reconcile.ts`,
`src/app/(admin)/admin/orders/{page.tsx,[id]/page.tsx,[id]/actions.ts,
_components/*}`, plus tests. Changed: `src/lib/db/queries/orders.ts` (list/count/
stats), `src/lib/webhooks/handle-event.ts` (delegates to reconcile),
`src/app/(admin)/admin/page.tsx` (nav entry + dashboard strip).

## 6. ⚠️ Operator-pending — live verification (THE gate to lift the tag)

Run on dev (sandbox). Requires admin sign-in (`biz@animeniacs.shop`) + one
sandbox purchase. Records: Resend-dependent legs noted "partial: blocked on
Resend" if Resend unset.

| # | Flow | Pass criteria |
|---|---|---|
| P17-1 | Order shows in `/admin/orders` after a sandbox purchase | correct total/status; detail page renders |
| P17-2 | Inspect the **paid** order's fulfillment on detail | confirm a fulfillment `uid` exists (validates the §4.2 update path on a real paid order) |
| P17-3 | Advance fulfillment in admin | Square reflects it → `order.fulfillment.updated` webhook → DB + customer label update; backward moves rejected |
| P17-4 | Issue full refund in admin | Square shows refund → `refund.created` webhook → status `refunded`, `refundedCents=total`; buyer refund email (Resend-gated) |
| P17-5 | Dashboard reflects the test order/refund | numbers update |
| P17-6 | Guards | refund hidden/disabled when already refunded or no `squarePaymentId` |

**Plus the still-deferred Phase 16 V1–V7** (auth walkthrough; receipt email;
review-with-photo persist; guest lookup; abandoned-cart cron end-to-end;
promo-edit propagation) — P17-1/4 overlap V2/V4 and are easier now via the admin
UI.

**Other operator-pending (unchanged from Phase 16):**
1. **Resend** — `RESEND_API_KEY` + `RESEND_FROM_EMAIL` still EMPTY in Coolify
   (verified via API 2026-06-16). Unblocks P17-4 + V2/V4/V6 + password reset.
2. **Cron scheduled task** — `CRON_SECRET` confirmed set in Coolify and matches
   `.env.local`; route works; only the Coolify-UI scheduled task is unwired
   (phase-16-handoff §4).
3. **Logto** — app env clean (no `LOGTO_*` in Coolify); retire the standalone
   `auth.animeniacs.shop` service.
4. *(minor)* Every Coolify key has a duplicate empty `${VAR:-}` placeholder —
   benign on dev; tidy before prod cutover.

## 7. Tag

`phase-17-admin-order-tooling` **HELD** at `5a6715e` until P17-1…P17-6 pass on
dev sandbox. Lift it once a real refund + fulfillment push are confirmed.

## 8. Phase 18+ candidates

- Partial/multi refunds; carrier/tracking + packing slips; bulk actions / CSV
  export; date-range reporting.
- Embedded Square Web Payments checkout; tags; profile editing; email
  verification ON.
- **LAST:** production cutover — live WooCommerce replacement; operator-gated,
  never autonomous.
