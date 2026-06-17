# RESUME HERE — Animeniacs Shop project state

**Last updated:** 2026-06-16 (Mac Master orchestrator session).
**Purpose:** the single "where are we / what's next" pickup doc, usable from any
machine. Read this first, then the linked phase handoff.

> Local auto-memory under `~/.claude` is NOT in the repo and does not sync.
> **This file is the cross-machine source of truth.**

---

## Where we are right now

- **Phase 17 (admin order tooling) shipped to dev as a READ-ONLY order log +
  dashboard. Live verification (read-only) is PENDING; tag HELD.**
  - `main` @ `7957794` (deployed to dev). Refunds + fulfillment/shipping are
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
  - Gates (Master re-ran): typecheck clean · **563 unit tests pass** ·
    unreachable-DB build = Compiled + 41/41 + 0 ENOTFOUND · canaries 0/0.
  - **Next gate (lighter, read-only) = order lists in `/admin/orders` + a
    Square-dashboard refund/fulfillment reflects on the site.** Then lift the tag.
  - Full detail + checklist: [phase-17-handoff.md](./phase-17-handoff.md).
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
1. **Resend:** set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (a verified sender).
   Unblocks ALL email: receipts, password reset, abandoned-cart, lifecycle.
2. **Wire the abandoned-cart cron** — the Coolify scheduled-task API is not
   exposed on this version (404), so it's UI-only: app → **Scheduled Tasks** →
   Add → cron `*/15 * * * *`, container = the app service, command:
   ```
   node -e "fetch('http://localhost:3000/api/cron/abandoned-carts',{method:'POST',headers:{'x-cron-secret':process.env.CRON_SECRET}}).then(r=>r.json().then(j=>{console.log(r.status,JSON.stringify(j));if(!r.ok)process.exit(1)}))"
   ```
   Manual test:
   `curl -X POST -H "x-cron-secret: <CRON_SECRET from .env.local>" https://dev.animeniacs.shop/api/cron/abandoned-carts`
   → expect `{"processed":N}`.
3. **Decommission** the old Logto deployment at `auth.animeniacs.shop` (its env
   vars are already removed from the app).

### B. Data entry
- Create the ~15 remaining artist records via `/admin/artists`; repoint merc to
  its 61-item category. The `/artist` empty state on dev is correct until then.

### C. Live verification — THE current priority (browser / sandbox)
Read-only now (refunds + fulfillment live in Square). Lifts the held `phase-17`
tag. Detail: [phase-17-handoff.md](./phase-17-handoff.md) §5.
- **P17 (read-only):** order records + lists in `/admin/orders` after a sandbox
  purchase (the BigInt fix unblocked this) · refund a test order **in the Square
  dashboard** → site shows `refunded` · advance fulfillment **in Square** → site
  label updates · dashboard reflects it.
- **Deferred Phase 16 V1–V7:** auth walkthrough · receipt email · review-with-
  photo persists · guest lookup · abandoned-cart cron end-to-end · promo-edit.
- Needs admin sign-in (`biz@animeniacs.shop`) + one sandbox purchase (use the
  Square "Checkout API Sandbox Testing Panel": Next → Test Payment → complete; no
  card). Resend-dependent email legs = "partial: blocked on Resend" until set.

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
