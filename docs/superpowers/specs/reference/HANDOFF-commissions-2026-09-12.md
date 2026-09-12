# Handoff — Commissions/Payouts + Deploy state (2026-09-12)

Living pointer for picking up cold. Pairs with the design spec
`docs/superpowers/specs/2026-08-06-artist-commissions-payouts-design.md`.

## What's built (all on `RelentNet/main`, HEAD `574a122`)

Full artist commission + payout system, plus storefront changes from the same run:

- **P1 — engine + admin report.** `src/lib/commissions/{calc,sweep,sync,report}.ts`
  (pure + unit-tested), `src/lib/db/queries/commissions.ts`, admin page
  `/admin/commissions`. Reads Square via the **env-driven** client (production in
  prod — the app already runs the prod key), sweeps BOTH locations (online +
  Mobile/shows), all history → `commission_earnings` (materialized, rebuilt by
  "Sync from Square"). Commission = each artist's `commissionRate` × net (gross −
  discount; discount is Square's per-line proportional allocation). Pre-refund.
- **P2 — payouts.** `artist_payouts` + a "Record a payout" form; report shows
  **Total made · Total paid · Balance owed** (negative = advanced).
- **Artist self-serve portal.** `/account/earnings` — an artist logs in and sees
  their own made/paid/balance + monthly + payments, scoped to themselves. Linked
  by `artists.account_email` (migration `0020`), matched to the signed-in email.
  Set it in Admin → Artists. "Earnings" tab only shows for linked artists.
- Storefront (same run, already live on dev): **LIT Box** nav button (purple→green
  glow), **shop category/IP search**, hidden-category filter, webhook
  online-location fix.

Migrations to apply on deploy: **`0019`** (commission tables + `artists.payable`)
and **`0020`** (`artists.account_email`). The `migrate` container runs them.

## Deploy state — RESOLVED (was the big blocker)

- The app serving **`dev.animeniacs.shop`** was building branch **`feature/shippo`**
  (stale). Operator switched it to **`main`** → the code now deploys. `deploy.sh`
  targets a *different* Coolify app (no domain), so it was never the right lever.
- `RelentNet/animeniacs-shop` auto-mirrors to **`itkujo/animeniacs-shop`** (what
  that app builds), so pushing to `RelentNet/main` reaches it within seconds.
- Removed hardcoded `container_name`s from `compose.yml` (`7ce2d9c`) so Coolify
  recreates containers cleanly.
- **Verified live after the branch switch:** category search (`merc`→24),
  `/admin/commissions` route exists, LIT Box present.
- **NEEDS ONE MORE REDEPLOY** to pick up `d410de2` (React-18 `useFormState` fix —
  the admin page crashed with `useActionState is not a function` before it) and
  `574a122` (portal). After redeploy, also set env
  **`SQUARE_MOBILE_LOCATION_ID = L182TWM8YVZSR`** so commissions include shows.

## To finish going live (operator, post-redeploy)

1. Redeploy the dev app (now on `main`). Set `SQUARE_MOBILE_LOCATION_ID`.
2. Log in as **`biz@animeniacs.shop`** (the only `ADMIN_EMAILS` entry) → **Admin →
   Commissions → Sync from Square**.

## DalynTNT close-out — IN PROGRESS

Departing artist, paid out in full, no future sales. Verified total (unchanged):
**233 units, net $5,561.98, commission $1,112.40**.
- **DONE (in prod Square):** created a **`DalynTNT`** category under Artist
  (`NUUARMQTW2VZ5RC6Q42UF2I2`) and tagged both live items (`DalynTNT Acrylic`
  `423JF5CCEDGHYHWFGT2C3USJ`, `Dalyntnt Print` `3KH2EEBNPWO42BCHKUKN3OHC`).
  Simulated sync: **$1,112.40 attributes, $0 unattributed** (clean — the gone
  "Vynil" item's sales map to the tagged items).
- **REMAINING (live admin, post-deploy):** Sync → DalynTNT shows $1,112.40 made →
  **record a $1,112.40 payout** → balance $0 → set the artist **`inactive`**.

## Open follow-ups / pending decisions

- **Portal active-gate (PENDING USER DECISION):** should the earnings portal +
  "Earnings" tab also require `status = 'active'`, so flipping an artist inactive
  revokes access? Currently keyed only on `account_email`. (Raised re: DalynTNT.)
- **Refund clawback:** figures are **pre-refund**; `sweep.ts` sets `refundCents=0`
  with a TODO. Needed before numbers are "payout-final."
- **Catalog cleanup:** untagged artworks (Band of the Hawk, Berserk, Murked, Sun
  God Wanted, …) still land in Unattributed; ~294 custom/no-catalog-id lines need
  **manual attribution** (feature not built — `commission_overrides` table exists
  but isn't wired into the report yet).
- **P3 polish:** CSV export on the commissions page; per-artist statements.

## Gotchas specific to this work

- App is React **18.3** → use `useFormState` from `react-dom`, NOT React-19
  `useActionState` (types exist, runtime doesn't — silent typecheck pass, client
  crash).
- Prod reads use `SQUARE_PROD_ACCESS_TOKEN` (in `.env.local`). Prod locations:
  online `L9G64BGJWXNF4`, Mobile `L182TWM8YVZSR`.
- Commission attribution is by artist CATEGORY (variation→item→category). New
  categories under "Artist" auto-become artists (seeded `inactive`, 20%) on sync.
- CLAUDE.md still says `SQUARE_ENV=sandbox everywhere` — stale for the serving
  app (it runs the prod key). Worth correcting.
