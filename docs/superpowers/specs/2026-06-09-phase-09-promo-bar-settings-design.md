# Phase 9: Promo Bar + Admin Settings + Deploy Hardening — Design

**Date:** 2026-06-09
**Status:** Approved (operator sign-off 2026-06-09)
**Phase:** 9
**Prior phase:** Phase 8 (shop listing), tag `phase-8-shop-listing`, commit `545ffe3`

---

## Goal

Add an operator-controlled promotional banner to the storefront, backed by a new
`/admin/settings` page that writes to the existing `site_settings` table. Harden
the deploy path so future phases stop hitting the "push didn't auto-deploy" loop.

## Scope

**In scope:**
1. Promo bar storefront component (reads `site_settings` key `promo_bar`)
2. `/admin/settings` page + form + server action (writes `promo_bar`)
3. `site_settings` query layer (`getSetting` / `upsertSetting` + Zod schema)
4. Admin hub link to Settings
5. Hardened `scripts/deploy.sh` canonical deploy path

**Out of scope (locked):**
- ProductCard refactor (deferred)
- Promo bar per-session dismissal / "X" close button (rejected: admin can disable instead)
- Multiple promo bars / scheduling / A-B variants (YAGNI)
- Any change to `Header.tsx` internals
- Exposing `is_auto_deploy_enabled` via API (not possible — Coolify limitation)

---

## Constraints (carried from prior phases)

1. `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0
2. No new Postgres tables/columns — `site_settings` already exists, used as-is
3. IP categories never public via literal Square name; nothing here touches category rendering
4. `SQUARE_ENV=sandbox` until prod cutover
5. No new auth vendors — reuse Logto + `(admin)` route group auth gate
6. Admin pages use inline styles (no Tailwind), `useFormState` from `react-dom` (NOT `useActionState`)

---

## Section A: Promo Bar

### Component

New file: `src/components/layout/PromoBar.tsx` — **server component** (no `'use client'`).

Reads the `promo_bar` setting at request time via `getSetting('promo_bar')`.
Behavior:
- Setting missing (`null`) → render `null`
- `enabled: false` → render `null`
- `enabled: true` → render the bar

### Value shape (jsonb stored under key `promo_bar`)

```ts
interface PromoBarValue {
  enabled: boolean
  text: string        // raw display text, no HTML
  link?: string       // optional URL; if present, text is wrapped in <a>
  bgColor: string     // CSS hex color, e.g. "#1a1a2e"
  textColor: string   // CSS hex color, e.g. "#ffffff"
}
```

### Markup

```tsx
<div
  role="region"
  aria-label="Promotions"
  style={{
    background: value.bgColor,
    color: value.textColor,
    textAlign: 'center',
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
  }}
>
  {value.link
    ? <a href={value.link} style={{ color: value.textColor, textDecoration: 'underline' }}>{value.text}</a>
    : <span>{value.text}</span>}
</div>
```

Inline styles (matches admin idiom; the bar's colors are dynamic so inline is the
natural fit). Single line, centered.

### Caching

`getSetting` wraps the DB read in
`unstable_cache(fn, ['site-settings', key], { revalidate: 60 })`.
The admin save action calls `revalidatePath('/')` to bust it immediately.

### Layout insertion

In `src/app/layout.tsx`, add `<PromoBar />` as the **first child inside
`<CartProvider>`**, immediately before `<Header />`:

```tsx
<CartProvider>
  <PromoBar />
  <Header />
  <main id="content" className="flex-1">{children}</main>
  <Footer />
</CartProvider>
```

`Header.tsx` is **not** modified.

---

## Section B: `/admin/settings`

### Files

| File | Responsibility |
|---|---|
| `src/lib/db/queries/site-settings.ts` | `getSetting(key)`, `upsertSetting(key, value, updatedBy)`, `PromoBarValueSchema`, `PromoBarValue` type |
| `src/app/(admin)/admin/settings/page.tsx` | Server component; reads `promo_bar`; renders form pre-populated |
| `src/app/(admin)/admin/settings/_components/PromoBarSettingsForm.tsx` | Client component; `useFormState`; inputs |
| `src/app/(admin)/admin/settings/actions.ts` | `savePromoBarAction` server action |

### Query layer (`site-settings.ts`)

```ts
import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db/client'           // confirmed: export const db at src/lib/db/client.ts:26
import { siteSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const PromoBarValueSchema = z.object({
  enabled:   z.boolean(),
  text:      z.string().min(1).max(200),
  link:      z.string().url().optional().or(z.literal('')),
  bgColor:   z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
})
export type PromoBarValue = z.infer<typeof PromoBarValueSchema>

// getSetting returns the raw jsonb value or null. Caller validates shape.
export async function getSetting<T = unknown>(key: string): Promise<T | null> { ... }

// upsertSetting writes value as jsonb, ON CONFLICT (key) DO UPDATE.
export async function upsertSetting(key: string, value: unknown, updatedBy: string | null): Promise<void> { ... }
```

`getSetting` is the cached read (see Section A caching). `upsertSetting` is the
uncached write.

### Form (`PromoBarSettingsForm.tsx`)

- `'use client'`
- `const [state, formAction] = useFormState(savePromoBarAction, undefined)`
- `<form action={formAction}>` with fields:
  - `enabled` — checkbox, `defaultChecked={current?.enabled}`
  - `text` — text input, `defaultValue={current?.text}`
  - `link` — text input (optional), `defaultValue={current?.link}`
  - `bgColor` — text input, `defaultValue={current?.bgColor ?? '#1a1a2e'}`
  - `textColor` — text input, `defaultValue={current?.textColor ?? '#ffffff'}`
- Error surfacing matches ip-nicknames: top banner `role="alert"` `background:#fee`;
  per-field `<span role="alert">` in `#a33`
- Submit button: `justifySelf:'start', padding:'0.5rem 1rem'`

### Server action (`actions.ts`)

```ts
'use server'
export async function savePromoBarAction(_prev, form: FormData): Promise<PromoBarFormState> {
  // 1. Extract FormData → raw object (checkbox → boolean, trims, '' for empty link)
  // 2. PromoBarValueSchema.safeParse(raw)
  // 3. if !success → return { error: { message, fields } }
  // 4. updatedBy: pass null. The existing ip-nicknames actions do NOT capture
  //    session identity, and site_settings.updated_by is nullable. Matching that
  //    convention (no getLogtoContext call in the action). updated_at is set by
  //    the DB default. Revisit if an audit trail is ever required.
  // 5. upsertSetting('promo_bar', value, null)
  // 6. revalidatePath('/')          // bust promo bar cache on storefront
  // 7. revalidatePath('/admin/settings')
  // 8. redirect('/admin/settings')
}
```

No DB unique-constraint handling needed (single fixed key, upsert never conflicts).

### Page (`page.tsx`)

Server component, `export const metadata`. Reads `getSetting<PromoBarValue>('promo_bar')`,
passes as `current` prop to the form. Outer wrapper:
`<div style={{ padding:'1.5rem', fontFamily:'system-ui, sans-serif' }}>` (the
`(admin)/layout.tsx` wrapper already supplies `color:#111, background:#fff`).

### Admin hub link

Add a `Settings` row/link to `src/app/(admin)/admin/page.tsx` pointing at
`/admin/settings`, matching the existing hub link style.

---

## Section C: Deploy Hardening

### Background

`is_auto_deploy_enabled` is a Coolify DB column **not exposed by the REST API**.
The only way to toggle push-triggered auto-deploy is the Coolify dashboard:
**project → `animeniacs-shop-dev` → Settings → Git → "Auto Deploy"**.
This is an operator action, not a code change.

### Deliverable: `scripts/deploy.sh`

Canonical deploy path for all future phases. Behavior:

```sh
#!/usr/bin/env bash
set -euo pipefail
# Load COOLIFY_API_TOKEN_ANIMANIACS_TEAM from .env.local
git push origin main
sleep 5
curl -fsS "https://empower.relentnet.com/api/v1/deploy?uuid=h4400cg04wg8www84ggks4sg&force=true" \
  -H "Authorization: Bearer ${COOLIFY_API_TOKEN_ANIMANIACS_TEAM}"
echo "Deploy queued."
```

- Reads the token from `.env.local` (gitignored); script contains no secret
- Force-deploy defeats the stale-build-cache problem noted in prior phases
- Idempotent: safe to re-run

### Operator instruction (in handoff)

Check the Coolify dashboard and enable **Auto Deploy** if off. The script is the
fallback regardless of that setting, so deploys are reliable either way.

---

## Testing

New test files under `tests/`:

1. `tests/public/promo-bar.test.tsx`
   - renders `null` when setting missing
   - renders `null` when `enabled: false`
   - renders bar with text + colors when enabled
   - wraps text in `<a href>` when `link` present; plain `<span>` when absent
   - applies `bgColor`/`textColor` to inline style
2. `tests/db/site-settings.test.ts` (or integration, per existing split)
   - `PromoBarValueSchema` accepts valid value
   - rejects empty text, bad hex color, non-URL link
3. `tests/admin/settings-page.test.tsx`
   - form pre-populates from `current` prop
   - submit with invalid data surfaces field errors (mock action)

Mock pattern: `vi.hoisted()` + `vi.mock` per existing convention; `next/image`,
`next/link`, `next/navigation` stubbed; server components tested by awaiting the
async function and rendering returned JSX.

---

## Verification (close-of-phase)

- Lint clean, typecheck clean
- All unit + integration tests green (existing 267 + 75 plus new)
- `grep -rn "goaffpro\|GoAffPro" src/ tests/` → 0
- Promo bar renders on `/` only when enabled (manual: insert a `promo_bar` row, load `/`)
- `/admin/settings` reachable from admin hub, saves and reflects on storefront
- `scripts/deploy.sh` exists, is executable, contains no hardcoded secret
- Live: `/api/health` 200; `/` 200 with promo bar HTML when enabled

---

## File Manifest

**Create:**
- `src/components/layout/PromoBar.tsx`
- `src/lib/db/queries/site-settings.ts`
- `src/app/(admin)/admin/settings/page.tsx`
- `src/app/(admin)/admin/settings/_components/PromoBarSettingsForm.tsx`
- `src/app/(admin)/admin/settings/actions.ts`
- `scripts/deploy.sh`
- `tests/public/promo-bar.test.tsx`
- `tests/db/site-settings.test.ts`
- `tests/admin/settings-page.test.tsx`

**Modify:**
- `src/app/layout.tsx` (insert `<PromoBar />`)
- `src/app/(admin)/admin/page.tsx` (add Settings hub link)
