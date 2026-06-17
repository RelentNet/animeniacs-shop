# RESUME HERE — Animeniacs Shop project state

**Last updated:** 2026-06-16 (Mac Master orchestrator session).
**Purpose:** the single "where are we / what's next" pickup doc, usable from any
machine. Read this first, then the linked phase handoff.

> Local auto-memory under `~/.claude` is NOT in the repo and does not sync.
> **This file is the cross-machine source of truth.**

---

## Where we are right now

- **Phase 18 (order-log fidelity) — SHIPPED, deployed, VERIFIED live, TAGGED
  `phase-18-order-log-fidelity`.** `main` @ `41e4923`.
  - Admin list/detail mirror Square **order state** (OPEN/COMPLETED) next to our
    status; detail shows a **Shipment** section (recipient/address/carrier/
    tracking) from the Square snapshot, refreshed on webhooks. Checkout now sets
    **askForShippingAddress** (collects ship-to address).
  - Migration-free; gates green (583 tests, 41/41 build, canaries 0/0).
  - **Live-verified 2026-06-17:** Square-state mirror shown; shipment display
    proven end-to-end (injected a sandbox SHIPMENT via API → webhook → renders).
  - **Sandbox caveat:** the sandbox checkout *simulator* doesn't render the
    address prompt (Square limitation) — `askForShippingAddress` is correctly set
    (API-confirmed); the prompt appears on the **production** checkout. Re-confirm
    P18-1 + real shipment details at cutover. Detail:
    [phase-18-handoff.md](./phase-18-handoff.md).
- **Phase 17 (admin order tooling) — SHIPPED, deployed, VERIFIED live on dev,
  and TAGGED `phase-17-admin-order-tooling`.** Read-only order log + dashboard.
  - `main` @ `7957794` (deployed to dev; tag at `45b8f1a`). Refunds + fulfillment/shipping are
    handled in **Square + Shippo**; the site is a read-only log that reflects
    their state via the existing webhooks. (Originally built with on-site refund
    + fulfillment-push; operator re-scoped to read-only mid-verification.)
  - **Also fixed (`7957794`): refund reconcile keyed by payment id** — Square
    books refunds on a separate $0 "refund order", so the old order-id match
    never reflected refunds. Now resolves the sale order via the payment.
  - Adds `/admin/orders` (list: search + status/fulfillment filters) +
    `/admin/orders/[id]` (read-only detail) + dashboard strip on `/admin`.
  - **Critical fix shipped (`d8b4844`): BigInt order-recording bug** — Square v44
    Money is `bigint`; storing the raw order in jsonb threw on serialize, so
    `payment.created` webhooks NEVER recorded orders (the whole order chain was
    silently broken, not just Phase 17). Now fixed + regression-tested.
  - Gates: typecheck clean · **564 unit tests pass** · unreachable-DB build =
    Compiled + 41/41 + 0 ENOTFOUND · canaries 0/0.
  - **Live-verified 2026-06-17:** 3 sandbox orders record + list in
    `/admin/orders`; a sandbox API refund reflected as **Refunded**; a pushed
    fulfillment shows ("Being prepared"). (Sandbox dashboard can't issue refunds
    — Square limitation; we used the Refunds API. Production dashboard is fine.)
  - Full detail: [phase-17-handoff.md](./phase-17-handoff.md).
- **Phase 16 (rendering/caching pass + admin nav)** SHIPPED + deployed + verified.
  `main` was @ `406e6a8`; tag `phase-16-caching-activation`. Detail:
  [phase-16-handoff.md](./phase-16-handoff.md). Its V1–V7 live legs are still
  deferred (batched with Phase 17's live verification below).
- Phases 1–15 previously shipped. Auth = **better-auth** (Logto fully removed).
  `SQUARE_ENV=sandbox`; goaffpro canary **0**.
- **Nothing is running.** No background sessions or jobs are active.
- **`.env.local` was restored on the Mac this session** (was missing — gitignored,
  doesn't sync). `CRON_SECRET` in Coolify confirmed to match it;
  `SQUARE_WEBHOOK_SIGNATURE_KEY` is set in Coolify (empty locally — only affects
  local webhook testing). Resend keys still EMPTY in Coolify.

---

## Resuming on a new machine (Mac)

1. `git fetch --tags && git pull` — you want `main` @ `406e6a8` (or later).
2. **`.env.local` is gitignored — it will NOT arrive via git.** Copy it across
   from the Windows machine (or rebuild from your secrets manager). Full key list
   is in `.env.example`. Two notes that bite if missed:
   - `./scripts/deploy.sh` needs `COOLIFY_API_TOKEN_ANIMANIACS_TEAM`.
   - **`CRON_SECRET` was added to `.env.local` this session** and set in Coolify —
     carry the *same* value over; it must match Coolify for the cron to authorize.
3. `corepack pnpm install && corepack pnpm content:build`
4. Verify gates:
   - `corepack pnpm typecheck` → clean
   - `corepack pnpm test` → 539 pass
   - Build gate: `DATABASE_URL=postgresql://x:x@unreachable-host:5432/db corepack pnpm exec next build`
     → expect "Compiled successfully" + "Generating static pages (40/40)" + 0
     ENOTFOUND/ECONNREFUSED. **On macOS this should exit 0** — the Windows-only
     `EPERM: symlink` quirk (judge-by-output, not exit code) won't apply.
5. **Deploy only via `./scripts/deploy.sh`.** Coolify app uuid
   `h4400cg04wg8www84ggks4sg`, base `https://empower.relentnet.com`, dev FQDN
   `dev.animeniacs.shop`.

---

## What's next — operator punch-list

Everything below needs **you**; that's why the autonomous run stopped after
Phase 16. Rough order = fastest → biggest.

### A. Config — Coolify (minutes)
1. ~~**Resend:** set `RESEND_API_KEY` + `RESEND_FROM_EMAIL`.~~ **DONE 2026-06-17**
   — both set in Coolify (from = `noreply@updates.animeniacs.shop`); password-reset
   send triggered (`POST /api/auth/request-password-reset`, 200). **Operator to
   confirm the reset email actually arrived** (verifies the `updates.animeniacs.shop`
   domain in Resend — operator confirmed Resend works 2026-06-17). ✅ **Forgot-
   password UI BUILT + shipped** (`f8013a5`/`641fb26`/`506381b`): `/forgot-password`
   + `/reset-password` pages + a "Forgot password?" link on `/sign-in`, wired to
   better-auth `requestPasswordReset`/`resetPassword`. (Phase 19.)
2. **Wire the abandoned-cart cron** — endpoint VERIFIED 2026-06-17
   (`POST /api/cron/abandoned-carts` with `x-cron-secret` → `{"processed":0}`,
   200; secret authorizes). Still UI-only to schedule (API not exposed, 404):
   app → **Scheduled Tasks** → Add → cron `*/15 * * * *`, container = app service,
   command:
   ```
   node -e "fetch('http://localhost:3000/api/cron/abandoned-carts',{method:'POST',headers:{'x-cron-secret':process.env.CRON_SECRET}}).then(r=>r.json().then(j=>{console.log(r.status,JSON.stringify(j));if(!r.ok)process.exit(1)}))"
   ```
4. ~~Tidy duplicate `${VAR:-}` empty env placeholders.~~ **DONE 2026-06-17** —
   removed the 10 redundant *empty* twins via the Coolify API (each real value
   preserved + verified; 48→38 entries; no redeploy). May regenerate on a future
   build if the compose still has `${VAR:-}` defaults — durable fix is removing
   those defaults in the compose.
3. ~~Decommission the old Logto deployment at `auth.animeniacs.shop`.~~ **DONE
   2026-06-17** — Coolify service `logto` (`fwkok848g80gwo4w0ccgo44s`, Animeniacs
   team) **STOPPED** (status `exited`; FQDN now 503). Reversible. Permanent
   **Delete** (destroys Logto's DB) left to the operator in the Coolify UI if
   desired.

### B. Data entry — DONE ✅ (2026-06-17)
- **16 artist records created** + linked to their Square "Artist > *" sub-categories
  via `/admin/artists` (driven through the admin UI), all `active`, showing on the
  public `/artist`. Avatars/social links left blank for the operator to edit.
  (`Bxnny.Arts` + `Merc Da Artist` pre-existed; 14 added this session.)

### C. Live verification — Phase 17 read-only legs DONE ✅ (2026-06-17)
Verified on dev sandbox: order recording + listing, refund reflection (via
Refunds API — sandbox dashboard can't refund), fulfillment reflection. Tag lifted.
- **Still deferred (Phase 16 V1–V7, not blocking):** auth walkthrough · receipt
  email (needs Resend) · review-with-photo persists · guest lookup · abandoned-
  cart cron end-to-end · promo-edit propagation.
- **Known artifact:** order `jWey…` shows "Completed" not "Refunded" — its refund
  ran under the pre-fix code (event_id already "seen", won't replay). New orders
  reflect correctly. Harmless; the webhook-idempotency hardening (handoff §6)
  would prevent this class.

### D. Phase 17 = admin order log — READ-ONLY, on dev (live-verify pending, §C)
- Spec: `docs/superpowers/specs/2026-06-16-phase-17-admin-order-tooling-design.md`
  (with read-only re-scope); handoff: [phase-17-handoff.md](./phase-17-handoff.md).
- Once §C passes: lift the tag (`phase-17-admin-order-tooling` @ `c40b83e`), then
  Phase 18. **Top Phase 18 candidate: checkout shipping-address collection** —
  the Square payment link doesn't capture a ship-to address, so Square/Shippo
  can't fulfill physical goods. Also: harden webhook idempotency (handoff §6).

### E. Production cutover — LAST, operator-gated
- A live WooCommerce-site replacement at `animeniacs.shop`. **Never autonomous.**
  The Phase 15 deploy gotchas recur here: a build must not require runtime-only
  secrets; Coolify auto-registers `${VAR:-}` keys with EMPTY values (set the real
  value, then redeploy); admin is granted via the `ADMIN_EMAILS` allowlist because
  the DB is internal to Coolify.

---

## Authoritative docs (in this repo)

- **This file** — quick pickup.
- Phase 16 detail — [phase-16-handoff.md](./phase-16-handoff.md).
- Phase 16 spec — `docs/superpowers/specs/2026-06-12-phase-16-caching-activation-design.md`.
- Phase 16 plan — `docs/superpowers/plans/2026-06-12-phase-16-caching-activation.md`.
- Prior phase handoffs — `phase-15-handoff.md` … in this `reference/` directory.
