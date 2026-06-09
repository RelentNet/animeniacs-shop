# Phase 9: Promo Bar + Admin Settings + Deploy Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operator-controlled promo bar to the storefront, backed by a new `/admin/settings` page writing to the existing `site_settings` table, plus a hardened `scripts/deploy.sh`.

**Architecture:** A `site_settings` key/value query layer (`getSetting`/`upsertSetting`) feeds a server-component `<PromoBar>` rendered above `<Header>` in the root layout. A single-form admin page at `/admin/settings` edits the `promo_bar` value via a `useFormState` server action following the ip-nicknames pattern exactly. The deploy script wraps `git push` + a forced Coolify deploy API call.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM (postgres-js), Zod, React 18 `useFormState`, Vitest, inline-styled admin pages.

**Spec:** `docs/superpowers/specs/2026-06-09-phase-09-promo-bar-settings-design.md`

---

## Pre-flight

- Branch: work on `main` (orchestrator convention; execution is a separate terminal).
- Baseline: tag `phase-8-shop-listing`, HEAD prior to this phase. Confirm clean tree: `git status`.
- Run `pnpm test` once to confirm green baseline (267 unit + 75 integration) before starting.

---

## File Structure

**Create:**
- `src/lib/db/queries/site-settings.ts` — query layer + Zod schema + types
- `src/components/layout/PromoBar.tsx` — storefront server component
- `src/app/(admin)/admin/settings/page.tsx` — admin settings page
- `src/app/(admin)/admin/settings/_components/PromoBarSettingsForm.tsx` — client form
- `src/app/(admin)/admin/settings/_components/formData.ts` — FormData parser
- `src/app/(admin)/admin/settings/_components/validation.ts` — Zod safeParse wrapper
- `src/app/(admin)/admin/settings/actions.ts` — server action
- `scripts/deploy.sh` — canonical deploy path
- `tests/db/site-settings.test.ts`
- `tests/public/promo-bar.test.tsx`
- `tests/admin/settings-page.test.tsx`

**Modify:**
- `src/app/layout.tsx` — insert `<PromoBar />`
- `src/app/(admin)/admin/page.tsx` — add Settings hub link

---

## Task 1: site_settings query layer

**Files:**
- Create: `src/lib/db/queries/site-settings.ts`
- Test: `tests/db/site-settings.test.ts`

- [ ] **Step 1: Write the failing test for the Zod schema**

`tests/db/site-settings.test.ts`:
```ts
import { PromoBarValueSchema } from '@/lib/db/queries/site-settings'
import { describe, expect, it } from 'vitest'

describe('PromoBarValueSchema', () => {
  const valid = {
    enabled: true,
    text: 'Free shipping over $50',
    link: 'https://example.com/sale',
    bgColor: '#1a1a2e',
    textColor: '#ffffff'
  }

  it('accepts a valid promo bar value', () => {
    expect(PromoBarValueSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an empty link', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, link: '' }).success).toBe(true)
  })

  it('rejects empty text', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, text: '' }).success).toBe(false)
  })

  it('rejects a non-hex bgColor', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, bgColor: 'red' }).success).toBe(false)
  })

  it('rejects a non-URL link', () => {
    expect(PromoBarValueSchema.safeParse({ ...valid, link: 'not a url' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/db/site-settings.test.ts`
Expected: FAIL — cannot import `PromoBarValueSchema` (module/export missing).

- [ ] **Step 3: Write the query layer**

`src/lib/db/queries/site-settings.ts`:
```ts
import 'server-only'
import { db } from '@/lib/db/client'
import { siteSettings } from '@/lib/db/schema'
import { unstable_cache } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

export const PromoBarValueSchema = z.object({
  enabled: z.boolean(),
  text: z.string().min(1).max(200),
  link: z.string().url().optional().or(z.literal('')),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/)
})

export type PromoBarValue = z.infer<typeof PromoBarValueSchema>

/**
 * Uncached read of a single setting's jsonb value. Returns null if the
 * key is absent. Callers validate the shape with the appropriate schema.
 */
async function readSetting(key: string): Promise<unknown | null> {
  const rows = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1)
  return rows[0]?.value ?? null
}

/**
 * Cached read (60s) used by the storefront. revalidatePath('/') in the
 * admin save action busts it on change.
 */
export function getSetting(key: string): Promise<unknown | null> {
  const cached = unstable_cache(() => readSetting(key), ['site-settings', key], {
    revalidate: 60
  })
  return cached()
}

/**
 * Upsert a setting value (jsonb). ON CONFLICT (key) DO UPDATE.
 */
export async function upsertSetting(
  key: string,
  value: unknown,
  updatedBy: string | null
): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedBy, updatedAt: new Date() }
    })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/db/site-settings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (If `siteSettings.value` typing rejects `unknown`, cast the insert value with `value as typeof siteSettings.$inferInsert['value']` — the column is jsonb so this is sound.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/queries/site-settings.ts tests/db/site-settings.test.ts
git commit -m "feat(db): site_settings query layer + promo bar schema"
```

---

## Task 2: PromoBar storefront component

**Files:**
- Create: `src/components/layout/PromoBar.tsx`
- Test: `tests/public/promo-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/public/promo-bar.test.tsx`:
```ts
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetSetting } = vi.hoisted(() => ({ mockGetSetting: vi.fn() }))
vi.mock('@/lib/db/queries/site-settings', () => ({ getSetting: mockGetSetting }))

import { PromoBar } from '@/components/layout/PromoBar'

const base = {
  enabled: true,
  text: 'Free shipping over $50',
  link: '',
  bgColor: '#1a1a2e',
  textColor: '#ffffff'
}

describe('PromoBar', () => {
  it('renders nothing when the setting is missing', async () => {
    mockGetSetting.mockResolvedValueOnce(null)
    const { container } = render(await PromoBar())
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when disabled', async () => {
    mockGetSetting.mockResolvedValueOnce({ ...base, enabled: false })
    const { container } = render(await PromoBar())
    expect(container.firstChild).toBeNull()
  })

  it('renders the bar text when enabled', async () => {
    mockGetSetting.mockResolvedValueOnce(base)
    const { getByText } = render(await PromoBar())
    expect(getByText('Free shipping over $50')).toBeTruthy()
  })

  it('wraps text in a link when link is present', async () => {
    mockGetSetting.mockResolvedValueOnce({ ...base, link: 'https://example.com/sale' })
    const { getByRole } = render(await PromoBar())
    const a = getByRole('link') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('https://example.com/sale')
  })

  it('applies bgColor and textColor as inline styles', async () => {
    mockGetSetting.mockResolvedValueOnce(base)
    const { getByRole } = render(await PromoBar())
    const region = getByRole('region')
    expect(region.style.background).toContain('rgb(26, 26, 46)') // #1a1a2e
    expect(region.style.color).toContain('rgb(255, 255, 255)')   // #ffffff
  })

  it('renders nothing when the stored value fails schema validation', async () => {
    mockGetSetting.mockResolvedValueOnce({ enabled: true, text: '' }) // invalid
    const { container } = render(await PromoBar())
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/public/promo-bar.test.tsx`
Expected: FAIL — cannot import `PromoBar`.

- [ ] **Step 3: Write the component**

`src/components/layout/PromoBar.tsx`:
```tsx
import { getSetting, PromoBarValueSchema } from '@/lib/db/queries/site-settings'

/**
 * Storefront promo bar. Server component. Reads the `promo_bar` setting
 * at request time. Renders nothing when missing, disabled, or invalid.
 * Inserted above <Header /> in the root layout.
 */
export async function PromoBar(): Promise<JSX.Element | null> {
  const raw = await getSetting('promo_bar')
  if (raw == null) return null

  const parsed = PromoBarValueSchema.safeParse(raw)
  if (!parsed.success) return null

  const v = parsed.data
  if (!v.enabled) return null

  const hasLink = typeof v.link === 'string' && v.link.length > 0

  return (
    <div
      role="region"
      aria-label="Promotions"
      style={{
        background: v.bgColor,
        color: v.textColor,
        textAlign: 'center',
        padding: '0.5rem 1rem',
        fontSize: '0.875rem'
      }}
    >
      {hasLink ? (
        <a href={v.link} style={{ color: v.textColor, textDecoration: 'underline' }}>
          {v.text}
        </a>
      ) : (
        <span>{v.text}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/public/promo-bar.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PromoBar.tsx tests/public/promo-bar.test.tsx
git commit -m "feat(storefront): promo bar server component"
```

---

## Task 3: Insert PromoBar into the root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Read the current layout**

Run: open `src/app/layout.tsx`. Confirm the structure:
```tsx
<CartProvider>
  <Header />
  <main id="content" className="flex-1">{children}</main>
  <Footer />
</CartProvider>
```

- [ ] **Step 2: Add the import**

Add near the other layout-component imports:
```tsx
import { PromoBar } from '@/components/layout/PromoBar'
```

- [ ] **Step 3: Insert the component**

Change the body so `<PromoBar />` is the first child inside `<CartProvider>`, before `<Header />`:
```tsx
<CartProvider>
  <PromoBar />
  <Header />
  <main id="content" className="flex-1">{children}</main>
  <Footer />
</CartProvider>
```

- [ ] **Step 4: Typecheck + build the route tree**

Run: `pnpm typecheck`
Expected: no errors. `PromoBar` is async — Next.js server components support async; the layout is itself a server component so this is valid.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(layout): render promo bar above header"
```

---

## Task 4: Admin settings form components

**Files:**
- Create: `src/app/(admin)/admin/settings/_components/PromoBarSettingsForm.tsx`
- Create: `src/app/(admin)/admin/settings/_components/formData.ts`
- Create: `src/app/(admin)/admin/settings/_components/validation.ts`

- [ ] **Step 1: Write the FormData parser**

`src/app/(admin)/admin/settings/_components/formData.ts`:
```ts
import type { PromoBarValue } from '@/lib/db/queries/site-settings'

function getStr(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Parse the promo bar form into a candidate value. `enabled` is a
 * checkbox (present === 'on' when checked). Colors/text/link are strings.
 * Validation (shape, hex, URL) happens in validation.ts via Zod.
 */
export function parsePromoBarForm(form: FormData): PromoBarValue {
  return {
    enabled: form.get('enabled') === 'on',
    text: getStr(form, 'text'),
    link: getStr(form, 'link'),
    bgColor: getStr(form, 'bgColor'),
    textColor: getStr(form, 'textColor')
  }
}
```

- [ ] **Step 2: Write the validation wrapper**

`src/app/(admin)/admin/settings/_components/validation.ts`:
```ts
import { PromoBarValueSchema } from '@/lib/db/queries/site-settings'
import type { PromoBarFormError } from './PromoBarSettingsForm'

export function validatePromoBarInput(
  raw: unknown
):
  | { ok: true; data: ReturnType<typeof PromoBarValueSchema.parse> }
  | { ok: false; error: PromoBarFormError } {
  const result = PromoBarValueSchema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }

  const fieldErrs: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '')
    if (!key) continue
    fieldErrs[key] = fieldErrs[key] ? `${fieldErrs[key]}; ${issue.message}` : issue.message
  }
  return {
    ok: false,
    error: { message: 'Please correct the highlighted fields.', fields: fieldErrs }
  }
}
```

- [ ] **Step 3: Write the form component**

`src/app/(admin)/admin/settings/_components/PromoBarSettingsForm.tsx`:
```tsx
'use client'

import type { PromoBarValue } from '@/lib/db/queries/site-settings'
import { useFormState } from 'react-dom'

export interface PromoBarFormError {
  message: string
  fields?: Partial<Record<string, string>>
}

export type PromoBarFormState = { error?: PromoBarFormError; saved?: boolean } | undefined

export interface PromoBarSettingsFormProps {
  action: (prev: PromoBarFormState, form: FormData) => Promise<PromoBarFormState>
  initial?: PromoBarValue | null
}

export function PromoBarSettingsForm({
  action,
  initial
}: PromoBarSettingsFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const v = initial
  const err = state?.error
  const fieldErr = (name: string) => err?.fields?.[name]

  return (
    <form
      action={formAction}
      method="post"
      style={{ display: 'grid', gap: '0.75rem', maxWidth: '40rem' }}
    >
      {err?.message && (
        <div role="alert" style={{ background: '#fee', padding: '0.5rem' }}>
          {err.message}
        </div>
      )}
      {state?.saved && !err && (
        <div role="status" style={{ background: '#dfd', padding: '0.5rem' }}>
          Saved.
        </div>
      )}

      <Field label="Enabled" hint="When off, the bar is hidden on the storefront.">
        <label>
          <input type="checkbox" name="enabled" defaultChecked={v?.enabled ?? false} /> Show promo
          bar
        </label>
      </Field>

      <Field label="Text" error={fieldErr('text')} hint="Up to 200 characters.">
        <input type="text" name="text" maxLength={200} defaultValue={v?.text ?? ''} />
      </Field>

      <Field
        label="Link (optional)"
        error={fieldErr('link')}
        hint="Full URL, e.g. https://… Leave blank for no link."
      >
        <input type="text" name="link" defaultValue={v?.link ?? ''} />
      </Field>

      <Field label="Background color" error={fieldErr('bgColor')} hint="Hex, e.g. #1a1a2e">
        <input type="text" name="bgColor" defaultValue={v?.bgColor ?? '#1a1a2e'} />
      </Field>

      <Field label="Text color" error={fieldErr('textColor')} hint="Hex, e.g. #ffffff">
        <input type="text" name="textColor" defaultValue={v?.textColor ?? '#ffffff'} />
      </Field>

      <button type="submit" style={{ justifySelf: 'start', padding: '0.5rem 1rem' }}>
        Save
      </button>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <small style={{ color: '#666' }}>{hint}</small>}
      {error && (
        <span role="alert" style={{ color: '#a33', fontSize: '0.85em' }}>
          {error}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (Note: `validation.ts` imports `PromoBarFormError` from the form file — same cross-import the ip-nicknames `validation.ts` uses.)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/settings/_components/
git commit -m "feat(admin): promo bar settings form components"
```

---

## Task 5: Admin settings server action

**Files:**
- Create: `src/app/(admin)/admin/settings/actions.ts`

- [ ] **Step 1: Write the action**

`src/app/(admin)/admin/settings/actions.ts`:
```ts
'use server'

import type { PromoBarFormState } from './_components/PromoBarSettingsForm'
import { parsePromoBarForm } from './_components/formData'
import { validatePromoBarInput } from './_components/validation'
import { upsertSetting } from '@/lib/db/queries/site-settings'
import { revalidatePath } from 'next/cache'

/**
 * Save the promo bar setting. updatedBy is null: the existing admin
 * actions (ip-nicknames) do not capture session identity and
 * site_settings.updated_by is nullable. Revalidates '/' to bust the
 * cached promo bar read so the storefront reflects the change immediately.
 *
 * Does not redirect — stays on the settings page and shows a saved banner,
 * so the operator can verify and keep editing.
 */
export async function savePromoBarAction(
  _prev: PromoBarFormState,
  form: FormData
): Promise<PromoBarFormState> {
  const input = parsePromoBarForm(form)
  const validated = validatePromoBarInput(input)
  if (!validated.ok) return { error: validated.error }

  await upsertSetting('promo_bar', validated.data, null)

  revalidatePath('/')
  revalidatePath('/admin/settings')
  return { saved: true }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/settings/actions.ts
git commit -m "feat(admin): promo bar save server action"
```

---

## Task 6: Admin settings page

**Files:**
- Create: `src/app/(admin)/admin/settings/page.tsx`
- Test: `tests/admin/settings-page.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/admin/settings-page.test.tsx`:
```tsx
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetSetting } = vi.hoisted(() => ({ mockGetSetting: vi.fn() }))
vi.mock('@/lib/db/queries/site-settings', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/queries/site-settings')>()
  return { ...actual, getSetting: mockGetSetting }
})
vi.mock('@/app/(admin)/admin/settings/actions', () => ({
  savePromoBarAction: vi.fn()
}))

import SettingsPage from '@/app/(admin)/admin/settings/page'

describe('SettingsPage', () => {
  it('pre-populates the form from the stored promo_bar value', async () => {
    mockGetSetting.mockResolvedValueOnce({
      enabled: true,
      text: 'Stored text',
      link: '',
      bgColor: '#111111',
      textColor: '#eeeeee'
    })
    const { getByDisplayValue } = render(await SettingsPage())
    expect(getByDisplayValue('Stored text')).toBeTruthy()
    expect(getByDisplayValue('#111111')).toBeTruthy()
  })

  it('renders defaults when no setting exists', async () => {
    mockGetSetting.mockResolvedValueOnce(null)
    const { getByDisplayValue } = render(await SettingsPage())
    expect(getByDisplayValue('#1a1a2e')).toBeTruthy() // default bgColor
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/admin/settings-page.test.tsx`
Expected: FAIL — cannot import the page.

- [ ] **Step 3: Write the page**

`src/app/(admin)/admin/settings/page.tsx`:
```tsx
import { getSetting, PromoBarValueSchema } from '@/lib/db/queries/site-settings'
import type { PromoBarValue } from '@/lib/db/queries/site-settings'
import { PromoBarSettingsForm } from './_components/PromoBarSettingsForm'
import { savePromoBarAction } from './actions'

export const metadata = {
  title: 'Settings — Animeniacs Admin'
}

export default async function SettingsPage(): Promise<JSX.Element> {
  const raw = await getSetting('promo_bar')
  const parsed = raw == null ? null : PromoBarValueSchema.safeParse(raw)
  const initial: PromoBarValue | null = parsed && parsed.success ? parsed.data : null

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <p style={{ color: '#555', marginTop: '0.5rem' }}>
          Storefront promo bar. Shown at the very top of every page when enabled.
        </p>
      </header>

      <h2 style={{ fontSize: '1.1rem' }}>Promo bar</h2>
      <PromoBarSettingsForm action={savePromoBarAction} initial={initial} />
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/admin/settings-page.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/settings/page.tsx tests/admin/settings-page.test.tsx
git commit -m "feat(admin): settings page with promo bar form"
```

---

## Task 7: Admin hub link

**Files:**
- Modify: `src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Add the Settings section to the SECTIONS array**

In `src/app/(admin)/admin/page.tsx`, append to the `SECTIONS` array (after the `sms-recipients` entry):
```ts
  {
    href: '/admin/settings' as Route,
    title: 'Settings',
    description: 'Storefront promo bar and other site-wide settings.'
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/page.tsx
git commit -m "feat(admin): link settings page from admin hub"
```

---

## Task 8: Deploy script

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Confirm scripts/ exists**

Run: `ls scripts/ 2>/dev/null || echo "no scripts dir"`
If absent, `mkdir -p scripts`.

- [ ] **Step 2: Write the script**

`scripts/deploy.sh`:
```sh
#!/usr/bin/env bash
# Canonical deploy path for animeniacs-shop.
# Pushes main, then forces a Coolify deploy (the GitHub push webhook is not
# reliably wired, and force defeats Coolify's stale-build-cache problem).
#
# Reads COOLIFY_API_TOKEN_ANIMANIACS_TEAM from .env.local. No secret is
# stored in this file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"
COOLIFY_BASE="https://empower.relentnet.com"
APP_UUID="h4400cg04wg8www84ggks4sg"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: .env.local not found at $ENV_FILE" >&2
  exit 1
fi

# Extract the token without sourcing the whole env file.
TOKEN="$(grep -E '^COOLIFY_API_TOKEN_ANIMANIACS_TEAM=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
TOKEN="${TOKEN%\"}"; TOKEN="${TOKEN#\"}"
if [[ -z "${TOKEN:-}" ]]; then
  echo "error: COOLIFY_API_TOKEN_ANIMANIACS_TEAM missing from .env.local" >&2
  exit 1
fi

echo "==> Pushing main…"
git push origin main

echo "==> Waiting for Coolify to register the push…"
sleep 5

echo "==> Forcing deploy…"
curl -fsS "$COOLIFY_BASE/api/v1/deploy?uuid=$APP_UUID&force=true" \
  -H "Authorization: Bearer $TOKEN"
echo
echo "==> Deploy queued."
```

- [ ] **Step 3: Make it executable**

Run: `chmod +x scripts/deploy.sh`

- [ ] **Step 4: Verify it has no hardcoded secret**

Run: `grep -nE '[A-Za-z0-9]{40,}' scripts/deploy.sh || echo "no long tokens — clean"`
Expected: "no long tokens — clean" (only the UUID and host appear, no bearer token literal).

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy.sh
git commit -m "chore(deploy): hardened canonical deploy script"
```

---

## Task 9: Full verification

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Full unit + integration suite**

Run: `pnpm test`
Expected: all green — prior 267 unit + 75 integration, plus new (5 + 6 + 2 = 13 unit). Confirm count rose accordingly.

- [ ] **Step 4: goaffpro canary**

Run: `grep -rn "goaffpro\|GoAffPro" src/ tests/ || echo "0 — clean"`
Expected: "0 — clean".

- [ ] **Step 5: Production build**

Run: `pnpm build`
Expected: success. Confirm `/admin/settings` appears in the route list. The `/` route remains dynamic-capable (promo bar reads DB; layout is not statically optimized away — if build complains about dynamic usage in the root layout, this is expected and fine since pages already opt into dynamic rendering; do NOT add `force-dynamic` to the root layout unless the build fails specifically on it).

- [ ] **Step 6: Commit any build-driven fixes (if needed)**

Only if Step 5 required changes:
```bash
git add -A && git commit -m "fix: build adjustments for promo bar / settings"
```

---

## Task 10: Manual smoke (operator-assisted) + handoff doc

- [ ] **Step 1: Write the phase handoff doc**

Create `docs/superpowers/specs/reference/phase-09-handoff.md` capturing: what shipped, the new files, the `promo_bar` value shape, how to enable the bar (insert/edit via `/admin/settings`), the deploy-script usage, the operator-pending items (Coolify Auto-Deploy toggle, admin dark-mode visual confirmation still pending from Phase 8), and the close-of-phase verification results (lint/typecheck/test counts, build route list, goaffpro canary). Match the format of the existing `docs/superpowers/specs/reference/phase-08-handoff.md`.

- [ ] **Step 2: Tag the phase**

```bash
git tag phase-9-promo-bar-settings
```

- [ ] **Step 3: Deploy**

Run: `./scripts/deploy.sh`
Expected: "Deploy queued."

- [ ] **Step 4: Operator instructions (document, do not block on these)**

1. In the Coolify dashboard → project → `animeniacs-shop-dev` → Settings → Git → enable **Auto Deploy** if it is off. The deploy script is the fallback regardless.
2. Sign into `/admin/settings`, enable the promo bar with sample text, save, and confirm it appears at the top of `/` on the live site.
3. Confirm `/api/health` returns 200.

- [ ] **Step 5: Final commit of handoff doc**

```bash
git add docs/superpowers/specs/reference/phase-09-handoff.md
git commit -m "docs: phase 9 handoff"
```

---

## Self-Review Notes

- **Spec coverage:** Section A (Tasks 2–3), Section B (Tasks 1, 4–7), Section C (Task 8). All spec file-manifest entries map to a task.
- **Type consistency:** `PromoBarValue`/`PromoBarValueSchema` (Task 1) consumed unchanged in Tasks 2, 4, 5, 6. `PromoBarFormState`/`PromoBarFormError` defined in the form (Task 4), imported by validation (Task 4) and action (Task 5). `savePromoBarAction` signature matches the form's `action` prop type.
- **Placeholder scan:** every code step has full code; no TODO/TBD.
- **Deviation from spec:** the action returns `{ saved: true }` and shows a "Saved." banner instead of `redirect('/admin/settings')`. Rationale: redirect on a single-form settings page would discard the success signal; a saved banner is better UX and the form already re-reads via `revalidatePath`. This is a minor, defensible refinement; flag to operator in the handoff.
