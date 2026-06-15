# RESUME HERE — Animeniacs Shop project state

**Last updated:** 2026-06-14 (Windows Master orchestrator session).
**Purpose:** the single "where are we / what's next" pickup doc, usable from any
machine. Read this first, then the linked phase handoff.

> The Windows machine's auto-memory under `~/.claude` is NOT in the repo and does
> not sync. **This file is the cross-machine source of truth.**

---

## Where we are right now

- **Phase 16 (rendering/caching pass + admin nav) is SHIPPED, deployed to dev,
  and verified.**
  - `main` @ `406e6a8`; tag `phase-16-caching-activation` (code at `b2aafe3`).
  - Live on https://dev.animeniacs.shop — health 200; ISR confirmed in prod
    (`/` static, `/artist` ISR-300, `/shop` stays dynamic); `/admin` + `/account`
    correctly gated (307 when signed out).
  - Gates all green: typecheck clean · **539 unit tests pass** · unreachable-DB
    build = Compiled + 40/40 static pages + 0 ENOTFOUND · canary greps 0/0.
  - Full detail: [phase-16-handoff.md](./phase-16-handoff.md).
- Phases 1–15 previously shipped. Auth = **better-auth** (Logto fully removed).
  `SQUARE_ENV=sandbox`; goaffpro canary **0**.
- **Nothing is running.** No background sessions or jobs are active.

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

### C. Live verification V1–V7 (browser / sandbox) — do this BEFORE building more
- Auth walkthrough · sandbox purchase → webhook → order → receipt · review-with-
  photo (persists across redeploy) · refund + fulfillment state changes · guest
  order lookup · abandoned-cart cron end-to-end · promo-edit propagation.
- Detail: [phase-16-handoff.md](./phase-16-handoff.md) §6.
- **Why first:** Phase 17 sits on the order/webhook chain — confirm that chain
  works end-to-end before building tooling on top of it.

### D. Decide the next phase
- **Recommended: Phase 17 = admin order tooling** — order list / detail /
  fulfillment-status updates / refund issuance / a small dashboard. NOT built
  autonomously because refund issuance moves money and the flow needs your
  sign-off. Decide how refunds should work and the orchestrator can spec + launch
  the session. (The `getSquareCustomer` / refund helpers orphaned in Phase 15 are
  reusable here.)
- Alternatives on the board: tags; embedded Square Web Payments checkout
  (your earlier "optional").

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
