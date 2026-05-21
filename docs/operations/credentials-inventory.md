# Credentials inventory + end-of-project cleanup plan

This is the running register of every secret, API token, M2M credential,
infra resource UUID, and access pattern the project has accumulated.

**Cleanup policy:** rotations and deletions are **deferred to the final
phase**. Phases between now and then may still need these to provision
new things (e.g. Phase 5 building a Coolify staging app, Phase 7 talking
to the Logto Management API for self-service signup, etc.). Rotating
mid-project would just create churn.

When you reach the final phase, walk through every row in the
[Cleanup checklist](#end-of-project-cleanup-checklist) below.

---

## Credentials

### Application-runtime keys (read by the Next.js app)

| Key | Where it lives | Purpose | Currently |
|---|---|---|---|
| `DATABASE_URL` | `.env.local` | Postgres connection for app data | Local dev only (`localhost:5433`) |
| `LOGTO_ENDPOINT` | `.env.local` | Logto OIDC issuer URL | `https://auth.animeniacs.shop` (Coolify) |
| `LOGTO_APP_ID` | `.env.local` | OIDC client id for 'Animeniacs Admin' Logto app | `u7ujmvfji0ecq3cqjp7nx` |
| `LOGTO_APP_SECRET` | `.env.local` | OIDC client secret. Starts with `#internal:` — must be quoted in `.env.local` so dotenv doesn't treat `#` as a comment | Active |
| `LOGTO_COOKIE_SECRET` | `.env.local` | Session-cookie encryption key (≥32 chars) | Active |
| `SQUARE_ACCESS_TOKEN` | `.env.local` | Sandbox access token, read by `src/lib/square/client.ts` | Active (sandbox) |
| `SQUARE_LOCATION_ID` | `.env.local` | Default sandbox location id | `L1T00JYXSKVM3` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | `.env.local` | Webhook HMAC verification | Not yet created (Phase 3 Task 11+) |
| `SQUARE_PROD_ACCESS_TOKEN` | `.env.local` | **Production** access token. Used ONLY by `scripts/square-cleanup/*` and `scripts/square-account-probe/*`, never imported by application code | Active (production) |
| `GOAFFPRO_ADMIN_API_KEY` | `.env.local` | GoAffPro admin API key. Phase 4 retired the runtime integration; this is kept for historical access to the GoAffPro dashboard data | Active (read-only use only) |
| `GOAFFPRO_PUBLIC_TOKEN` | `.env.local` | GoAffPro storefront token | Active (unused by runtime) |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` | `.env.local` | URL for the Plausible tracking script (centralized at `analytics.relentnet.dev`) | Empty (not wired yet) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `.env.local` | Site identifier for Plausible | `animeniacs.shop` |

### Infrastructure / automation tokens (used by scripts + AI agents)

| Key | Where it lives | Purpose | Risk if leaked |
|---|---|---|---|
| `COOLIFY_API_TOKEN_RELENTNET_TEAM` (`32|...def96e`) | `.env.local` | Full API access to the relentnet team on `empower.relentnet.com`. Created during the Plausible deploy session (2026-05-20). | Full read/write on relentnet-team apps |
| `COOLIFY_API_TOKEN_ANIMANIACS_TEAM` (`33|...676fdf0f`) | `.env.local` | Same but for the Animaniacs team. Created during the Logto deploy session (2026-05-20). | Full read/write on Animaniacs-team apps |
| `LOGTO_M2M_CLIENT_ID` (`jdgf83fujx9lsldzyiq8o`) | `.env.local` | Client ID for the 'claude' M2M app inside Logto. Created by you 2026-05-20 to let AI agents call Logto's Management API. | Read/write on every Logto user, role, app, sign-in-experience config |
| `LOGTO_M2M_CLIENT_SECRET` (`BZTxCd...`) | `.env.local` | Paired secret | Same as above |
| `LOGTO_ADMIN_TEMP_PASSWORD` | `.env.local` | Temp password for the `phoenix` Logto user. | Login access to `/admin/artists` |

### Logto management identities (existing inside Logto)

| Identity | Where | Notes |
|---|---|---|
| Logto admin console owner | Logto admin console at `https://auth-admin.animeniacs.shop` | This is the **bootstrap** admin you created during first-run setup. Separate from `phoenix`. Username + password are in your password manager, not here. |
| `phoenix` user (id `9agwioc10tcn`) | Logto users list | Application user. Has the `admin` role. Used to sign into `/admin/artists`. |
| `admin` role (id `s0or71dvjab62vhup2yxv`) | Logto roles list | Phase 4 RBAC. Checked by `(admin)/layout.tsx`. |
| `Animeniacs Admin` app (id `u7ujmvfji0ecq3cqjp7nx`) | Logto applications list | OIDC client for the Next.js app. |
| `claude` M2M app (id `jdgf83fujx9lsldzyiq8o`) | Logto applications list | M2M client for the Management API. |

---

## Infrastructure resources (Coolify, Square)

These are not secrets, but they're useful for future phases.

### Coolify (host: `empower.relentnet.com`, IP `5.161.88.222`)

| Resource | UUID | Notes |
|---|---|---|
| Server `infrastructure-shared-host` (relentnet) | `e8k880gsw4gow48coc0s80c0` | The shared Hetzner host. Token #1 sees this. |
| Server `animaniacs-shared-host` (Animaniacs) | `z0sg4ogw4ossg4880080ws8k` | Same physical host, different team scope. Token #2 sees this. |
| Project `Plausible` (relentnet team) | `gck0w48goww08wok0w44sg8k` | |
| Service `plausible` (Plausible app) | `t8okwogw8gggoowk4gwss4sg` | Live at `https://analytics.relentnet.dev` |
| Project `website` (Animaniacs team) | `q4gso4kow0k08gowc4g40ww4` | Where Logto + future Next.js app deploys live |
| Service `logto` (Animaniacs team) | `fwkok848g80gwo4w0ccgo44s` | Live at `https://auth.animeniacs.shop` + `https://auth-admin.animeniacs.shop` |

### Square (`Animeniacs.Shop` merchant — id `ML9YFWJCKY96D`)

| Resource | ID | Notes |
|---|---|---|
| Production main location | `L182TWM8YVZSR` | Animeniacs Mobile |
| Production secondary location | `L9G64BGJWXNF4` | Online Sales |
| Sandbox location | `L1T00JYXSKVM3` | |
| `Artist` top-level category (production) | `B6I2KLCRDEHSF6XHODMNSG6P` | Parent of all artist sub-categories |
| `Animeniacs Studios` artist sub-category | `S4XVDN5CBHKYGLLIDZYQWLHJ` | Created 2026-05-20. In-house commissioned work bucket. |
| `sarudrawss` artist sub-category | `IQRGYFIHNYMIXMYSA3XUZYAW` | Created 2026-05-20. |
| All other artist sub-categories (12 of them) | See `src/lib/square/categories.ts` runtime fetch | Discovered at request time by name + null-parent. |

---

## End-of-project cleanup checklist

When the project reaches its final phase, walk through this list **in order**:

### Rotate (don't just delete — these are still needed in some form)

- [ ] **`LOGTO_ADMIN_TEMP_PASSWORD`** — log into Logto admin console as the bootstrap owner → Users → phoenix → Reset password. Update `.env.local` if you keep using `phoenix` as your admin login.
- [ ] **`SQUARE_ACCESS_TOKEN`** (sandbox) — only if you suspect it's been compromised. Regenerate at Square Developer Dashboard.
- [ ] **`SQUARE_PROD_ACCESS_TOKEN`** — same. **High-value target**; rotate at the first sign of exposure.
- [ ] **`LOGTO_COOKIE_SECRET`** — regenerate via `openssl rand -base64 48 | tr -d '\n'`. Logs out every existing session, harmless.

### Delete (no longer needed)

- [ ] **`COOLIFY_API_TOKEN_RELENTNET_TEAM`** — Coolify UI → Keys & Tokens → delete. Was used to deploy Plausible.
- [ ] **`COOLIFY_API_TOKEN_ANIMANIACS_TEAM`** — same. Was used to deploy Logto + future apps.
- [ ] **`LOGTO_M2M_CLIENT_ID` / `_SECRET`** (the `claude` M2M app) — Logto admin console → Applications → claude → Delete. Was used to script Logto resource creation.
- [ ] **`GOAFFPRO_ADMIN_API_KEY` / `_PUBLIC_TOKEN`** — only if you've fully retired the GoAffPro subscription. Probably want to keep these until the subscription is cancelled.

### Verify

- [ ] `grep -rn "32|ZvHd\|33|SqgA\|jdgf83fuj\|BZTxCd\|_h1Xo9TqLa" .` returns **0 hits** outside `.env.local` and this doc. (If something other than these two files surfaces, the leak is real and needs a wider rotation.)
- [ ] `git log --all -p | grep -E "32\|ZvHd|33\|SqgA|jdgf83fuj|BZTxCd"` returns **0 hits**. (If a secret made it into git history, it needs to be considered permanently leaked and rotated regardless.)
- [ ] All `cleanup-audit/*.jsonl` audit logs are reviewed (or moved to long-term storage if you want them for compliance).
- [ ] `/tmp/artist-seed/`, `/tmp/plausible-secrets.txt`, `/tmp/logto-app-credentials.txt`, `/tmp/animeniacs-square-snapshot-*.json` removed.

### Document

- [ ] Update this file: move every "Active" row to "Rotated YYYY-MM-DD" or "Deleted YYYY-MM-DD" with the date.
- [ ] Commit the cleanup itself: `git commit -m "Final phase: rotate / delete short-lived credentials"`

---

## How to add new credentials going forward

When future phases create new secrets:

1. **Put the value in `.env.local`** with a comment block explaining what it's for. Quote any value that starts with `#`, `!`, or contains `$`.
2. **Add a row to this file** under the relevant section. Be specific about what risk a leak carries.
3. **Add a row to the "End-of-project cleanup checklist"** specifying whether the credential should be rotated or deleted at end-of-project.
4. **Do NOT commit `.env.local`.** It's gitignored, but always sanity-check `git status` before commits.

If you ever need to share a credential with an AI agent in a chat session: assume it's compromised the moment you paste it, even if the agent is well-behaved. Add a "Rotated YYYY-MM-DD" entry immediately after the session ends.
