# Next session kickoff — Shippo dynamic shipping

Paste this whole file as the opening prompt for the new session (or read it first if
resuming). It is self-contained.

---

## Your task

Replace the interim **flat $10 US shipping fee** with **Shippo dynamic shipping**:
collect the buyer's shipping address **on our own site before payment**, quote live
Shippo carrier rates from it, let the buyer pick (or auto-select), then create the
Square hosted Payment Link with the chosen shipping folded in and the address
pre-filled. This also unblocks **international** shipping and lets us **enforce
shippable countries** (US-only is the current stopgap, not enforced).

This is **money-critical checkout code** — plan it first (EnterPlanMode), get
sign-off, then build. Run the full gate suite before deploy. Deploy ONLY via
`./scripts/deploy.sh`.

## Why this is a real build (the architectural reason)

Today checkout sends only product line items to a Square **hosted** Payment Link
with `askForShippingAddress: true`, so **Square collects the address on its own page
AFTER the redirect** — too late to quote rates or enforce countries. Square's
`CheckoutOptions` has **no country restriction**. So address-based dynamic shipping
*requires* an on-site address step before we create the payment link. There is no
config toggle for this.

## Current state (what exists now)

- **Flat-fee stopgap to REMOVE:** `FLAT_SHIPPING_CENTS = 1000n` and the
  `checkoutOptions.shippingFee` block in
  [`src/lib/checkout/create-payment-link.ts`](../../../../src/lib/checkout/create-payment-link.ts).
  Its test: `tests/checkout/create-payment-link.test.ts`. Cart notice ("$10 flat ·
  U.S. only") is the first `<li>` in `src/components/cart/CartDrawer.tsx`.
- **Checkout flow:** `src/components/cart/CartDrawer.tsx` `handleCheckout()` POSTs the
  cart to `src/app/api/checkout/route.ts`, which `validateCart()` →
  `createPaymentLink()` → returns `checkoutUrl`; the client redirects to Square.
- **Square SDK:** `square@44` (`client.checkout.paymentLinks.create`). Money amounts
  are **bigint**. `CheckoutOptions` supports `shippingFee` and `prePopulatedData`
  (buyer address/email) — use the latter to pre-fill the address Shippo validated, and
  set `askForShippingAddress: false` once we collect it ourselves.
- **No Shippo integration exists** anywhere (`grep -ri shippo src/` = only a comment).
  Shippo is currently used *externally* for labels post-order.
- **Order recording:** `payment.created` webhook → `src/lib/orders/build-order.ts`.
  The order total (`total_money`) already includes the shipping fee; confirm the
  selected rate flows into the recorded order/shipment model.
- **Env:** validated in `src/lib/env.ts`; runtime vars passed through the explicit
  list in `compose.yml`'s `app` service (a NEW env var must be added there too, like
  `ART_IMAGE_MAX_EDGE` was — Coolify only auto-lists vars referenced in compose).
- **`dev.animeniacs.shop` runs PRODUCTION Square now.** Test against it carefully
  (real catalog; a completed checkout is a real charge — use a low-value item + refund,
  or test rate-quoting up to the Square redirect without paying).

## Decisions / inputs to get from the operator at session start

1. **Shippo account:** API token (test + live), and which **carriers** are connected.
   (New env var, e.g. `SHIPPO_API_TOKEN`, added to `env.ts` + `compose.yml` + Coolify.)
2. **Ship-from address** (origin for rating).
3. **Parcel specs:** dimensions + weight for the art prints / Litbox frames — per
   product, per size-variation, or a sensible default set? Shippo needs parcel data to
   rate. (Acrylic wall art is ~16×24"; confirm package dims/weight.)
4. **Rate UX:** buyer **picks** among live rates (Ground/Express/…) vs system
   **auto-selects** (cheapest or a chosen service). Affects the checkout UI.
5. **Countries:** US (incl. PR/AK) confirmed; which **international** countries to open,
   and enforce a shippable-country allowlist before payment.
6. **Free-shipping / thresholds?** (e.g., free over $X) — or always carrier-rated.

## Suggested shape (validate in plan mode)

- New `src/lib/shipping/shippo.ts` — client + `getRates({ to, parcel })`.
- New on-site **address + rate step** before redirect: either a `/checkout` page or a
  step inside the cart drawer (collect address → POST to a new
  `/api/checkout/rates` → show rates → buyer selects).
- `createPaymentLink()` gains the chosen shipping (as `shippingFee` or an order
  service-charge/line-item) + `prePopulatedData` (address/email) + drops
  `askForShippingAddress` (we already have it). Remove the flat-fee constant.
- Country allowlist enforced **before** creating the payment link (reject non-shippable
  with a clear message).
- Tests: Shippo client (mocked), rates endpoint, country enforcement, and the updated
  `create-payment-link` payload. Verify locally via the DB-free preview route trick
  (see auto-memory `db-free-local-preview`).

## Definition of done

`typecheck` clean · `test` green · canaries `logto`/`goaffpro` = 0 · unreachable-DB
`next build` exit 0 · the flat-fee stopgap removed · a real rate quote shown for a US
address on `dev.animeniacs.shop` · deploy via `deploy.sh` (auto-warms ISR).
