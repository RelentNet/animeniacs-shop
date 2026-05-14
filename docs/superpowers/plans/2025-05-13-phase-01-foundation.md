# Phase 1: Foundation & Local Docker Stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the entire infrastructure topology (Next.js app + Postgres + Logto + Plausible) running on the local dev laptop via `docker compose up`, with the basic site shell, navigation, footer, and all static content pages live at `localhost:3000`. No external API integration yet. This is the foundation everything else builds on.

**Architecture:** Next.js 14 (App Router) + TypeScript + Tailwind (minimal, functionality-first) in a multi-stage Dockerfile. Postgres 16 shared across services. Drizzle ORM with Drizzle Kit for migrations. Vitest for tests. Biome for lint+format. pnpm package manager. Docker Compose orchestrates everything.

**Tech Stack:** Next.js 14 App Router, TypeScript 5, Tailwind CSS 4, Drizzle ORM, Vitest, Biome, pnpm, Docker Compose v2, Postgres 16, Logto v1.23+, Plausible CE.

**Outcome at end of Phase 1:** Run `docker compose up` → visit `http://localhost:3000` → see the full site shell with working navigation, footer, all 12 static content pages rendering from markdown sources, sign-in button visible (but auth not yet wired), `/admin` route returning 404 (admin built in Phase 7). Postgres reachable at `localhost:5432`. Logto reachable at `localhost:3001`. Plausible reachable at `localhost:8000`. Full test suite (`pnpm test`) and typecheck (`pnpm typecheck`) pass.

**API keys needed:** None — Phase 1 is fully offline-capable.

---

## File structure for Phase 1

```
animeniacs-shop/
├── .dockerignore
├── .env.example                  ← committed; .env.local is gitignored
├── .gitignore                    ← already exists; add Next.js + Docker entries
├── biome.json                    ← Biome config
├── compose.yml                   ← single docker-compose entry point
├── Dockerfile                    ← multi-stage Next.js build
├── drizzle.config.ts             ← Drizzle Kit config
├── next.config.mjs           ← .mjs because Next.js 14 doesn't support .ts config
├── package.json
├── pnpm-lock.yaml                ← generated
├── README.md                     ← already exists; expand setup instructions
├── tsconfig.json
├── vitest.config.ts
│
├── docker/
│   ├── logto/
│   │   └── README.md             ← notes on Logto init
│   └── plausible/
│       └── plausible-conf.env    ← Plausible env vars (committed; secrets in .env.local)
│
├── drizzle/
│   └── migrations/               ← Drizzle-generated SQL migrations (committed)
│
├── public/
│   ├── icons/
│   │   └── event-generic.svg     ← placeholder for events without hashtag (later phase)
│   └── favicon.ico
│
├── scripts/
│   └── content-build.ts          ← markdown → JSON build step for static pages
│
├── src/
│   ├── app/
│   │   ├── layout.tsx            ← root layout with nav + footer
│   │   ├── page.tsx              ← homepage stub
│   │   ├── globals.css           ← Tailwind base + minimal globals
│   │   ├── about-us/page.tsx
│   │   ├── b2b/page.tsx
│   │   ├── become-an-artist/page.tsx
│   │   ├── careers/page.tsx
│   │   ├── contact-us/page.tsx
│   │   ├── faqs/page.tsx
│   │   ├── how-to-display-our-art/page.tsx
│   │   ├── partner-with-us/page.tsx
│   │   ├── privacy-policy/page.tsx
│   │   ├── refund-return-policy/page.tsx
│   │   ├── shipping-policy/page.tsx
│   │   ├── terms-of-service/page.tsx
│   │   ├── twitch/route.ts       ← server redirect to twitch.tv
│   │   └── api/
│   │       └── health/route.ts   ← liveness check used by Docker
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── NewsletterSignupStub.tsx  ← form UI only; wires up Phase 9
│   │   └── content/
│   │       └── MarkdownPage.tsx          ← renders parsed markdown content
│   │
│   ├── lib/
│   │   ├── content.ts            ← markdown loader for static-content-source/*.md
│   │   ├── db/
│   │   │   ├── client.ts         ← Drizzle Postgres client
│   │   │   └── schema.ts         ← initial site_settings table (rest in Phase 2)
│   │   └── env.ts                ← env-var validation (zod)
│   │
│   └── test/
│       └── setup.ts              ← Vitest global setup
│
└── tests/
    ├── content.test.ts
    ├── header.test.tsx
    ├── footer.test.tsx
    └── pages/
        └── static-pages.test.tsx
```

---

## Pre-flight: Verify environment

- [ ] **Step 0.1: Check tooling availability**

Run:
```bash
node --version    # >= 20
pnpm --version    # >= 8
docker --version  # >= 24
docker compose version  # v2.20+
```

Expected: all four return version numbers, no "command not found". If pnpm is missing: `npm install -g pnpm`. If docker is missing: install Docker Desktop or Docker Engine.

- [ ] **Step 0.2: Confirm working directory**

Run:
```bash
pwd
```

Expected: `/home/phoenix/code/animeniacs-shop` (or wherever the repo lives). All subsequent paths in this plan are relative to this directory.

- [ ] **Step 0.3: Confirm git repo is clean and on `main`**

Run:
```bash
git status
git branch --show-current
```

Expected: working tree clean, on `main` branch. The repo should already contain `docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md`, `README.md`, `.gitignore`, and the `static-content-source/` markdown files from the design phase.

---

## Task 1: Next.js project scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml` (optional, future-proofing) — skip for now
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1.1: Initialize package.json**

Create `package.json`:

```json
{
  "name": "animeniacs-shop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "lint:fix": "biome check --apply .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "content:build": "tsx scripts/content-build.ts",
    "prebuild": "pnpm content:build"
  },
  "dependencies": {
    "next": "^14.2.18",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/node": "^20.17.6",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 1.2: Install initial dependencies**

Run:
```bash
pnpm install
```

Expected: creates `node_modules/` and `pnpm-lock.yaml`. No errors.

- [ ] **Step 1.3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 1.4: Create next.config.mjs**

Note: Next.js 14 does not support `.ts` config files (added in Next 15). Use `.mjs`.

```javascript
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true
  },
  // Square CDN images will be added in Phase 3
  images: {
    remotePatterns: []
  }
}

export default config
```

- [ ] **Step 1.5: Create src/app/globals.css**

```css
/* Tailwind directives added in Task 2 */

:root {
  color-scheme: light dark;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
  line-height: 1.5;
}

a {
  color: inherit;
}
```

- [ ] **Step 1.6: Create src/app/layout.tsx (minimal)**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Animeniacs',
  description: 'Fandom at its best — anime art, gaming gear, and more.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 1.7: Create src/app/page.tsx (homepage stub)**

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Animeniacs</h1>
      <p>Fandom at its best!</p>
    </main>
  )
}
```

- [ ] **Step 1.8: Verify Next.js dev server runs**

Run:
```bash
pnpm dev
```

Expected output includes `Ready in <time>` and `Local: http://localhost:3000`. Visit the URL in a browser — should see "Animeniacs / Fandom at its best!". Stop the server with Ctrl+C.

- [ ] **Step 1.9: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: exits 0 with no output.

- [ ] **Step 1.10: Commit**

```bash
git add .
git commit -m "Task 1: Next.js project scaffold

- Next.js 14 App Router + TypeScript 5 + React 18
- pnpm package manager
- Path alias @/* → ./src/*
- Minimal homepage stub at /
- Health: pnpm dev / pnpm typecheck both green"
```

---

## Task 2: Tailwind CSS (minimal, functionality-first)

The spec is explicit that aesthetics are deferred. Tailwind is included as a utility framework so future styling work is a layer-on, not a rewrite. v1 uses Tailwind's defaults with zero custom theming.

**Files:**
- Create: `postcss.config.mjs`
- Modify: `package.json` (add tailwindcss)
- Modify: `src/app/globals.css` (add Tailwind directives)

- [ ] **Step 2.1: Install Tailwind CSS v4**

Run:
```bash
pnpm add -D tailwindcss@^4 @tailwindcss/postcss@^4 postcss@^8
```

- [ ] **Step 2.2: Create postcss.config.mjs**

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

- [ ] **Step 2.3: Update src/app/globals.css**

Replace entire file with:

```css
@import "tailwindcss";

:root {
  color-scheme: light dark;
}

html, body {
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 2.4: Add a Tailwind utility to the homepage to prove it works**

Edit `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Animeniacs</h1>
      <p className="mt-2 text-gray-700">Fandom at its best!</p>
    </main>
  )
}
```

- [ ] **Step 2.5: Verify Tailwind compiles**

Run `pnpm dev`, visit `http://localhost:3000`. The h1 should be larger and bold, paragraph should have a top margin, and the page should be horizontally centered.

- [ ] **Step 2.6: Commit**

```bash
git add .
git commit -m "Task 2: Tailwind CSS v4 (minimal defaults, no custom theme)

Aesthetic styling is deferred per spec §0 (Non-Goals). Tailwind
is in place so future theming is additive."
```

---

## Task 3: Biome lint/format

**Files:**
- Create: `biome.json`
- Modify: `package.json` (already has scripts; verify)

- [ ] **Step 3.1: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "ignore": [".next", "node_modules", "drizzle/migrations", "public"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "warn",
        "useImportType": "error"
      },
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "none",
      "semicolons": "asNeeded",
      "arrowParentheses": "always"
    }
  }
}
```

- [ ] **Step 3.2: Run Biome to format the existing code**

Run:
```bash
pnpm lint:fix
```

Expected: applies formatting changes, no errors. Files in `src/` get reformatted to match Biome rules.

- [ ] **Step 3.3: Verify lint passes**

Run:
```bash
pnpm lint
```

Expected: exits 0 with no errors. Warnings allowed but no failures.

- [ ] **Step 3.4: Commit**

```bash
git add .
git commit -m "Task 3: Biome lint+format configured

- Single quotes, no semicolons (Biome enforces auto)
- 2-space indent, 100-char line length
- Strict linter: no explicit any, useImportType required"
```

---

## Task 4: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json` (add deps)

- [ ] **Step 4.1: Install testing deps**

Run:
```bash
pnpm add -D vitest@^2 @vitejs/plugin-react@^4 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25
```

- [ ] **Step 4.2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

- [ ] **Step 4.3: Create src/test/setup.ts**

```typescript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4.4: Add a smoke test**

Create `tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('smoke test', () => {
  it('1 + 1 equals 2', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4.5: Run the smoke test**

Run:
```bash
pnpm test
```

Expected: `1 passed`, no failures.

- [ ] **Step 4.6: Commit**

```bash
git add .
git commit -m "Task 4: Vitest + Testing Library setup

- jsdom environment
- Path alias resolution matching tsconfig
- @testing-library/jest-dom matchers globally available"
```

---

## Task 5: Env-var validation (zod)

**Files:**
- Create: `src/lib/env.ts`
- Create: `.env.example`
- Modify: `.gitignore` (ensure .env.local is ignored — already done)

- [ ] **Step 5.1: Install zod**

Run:
```bash
pnpm add zod@^3
```

- [ ] **Step 5.2: Create src/lib/env.ts**

```typescript
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  LOGTO_ENDPOINT: z.string().url().default('http://localhost:3001'),
  LOGTO_APP_ID: z.string().min(1).optional(),
  LOGTO_APP_SECRET: z.string().min(1).optional(),
  LOGTO_COOKIE_SECRET: z.string().min(32).optional()
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
  return result.data
}

export const env = parseEnv()
```

- [ ] **Step 5.3: Create .env.example**

```bash
# Database
DATABASE_URL=postgres://animeniacs:animeniacs@localhost:5432/animeniacs

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Logto (filled in Phase 7)
LOGTO_ENDPOINT=http://localhost:3001
LOGTO_APP_ID=
LOGTO_APP_SECRET=
LOGTO_COOKIE_SECRET=replace_with_openssl_rand_base64_48

# Square (Phase 3) — leave blank for now
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
SQUARE_WEBHOOK_SIGNATURE_KEY=
SQUARE_ENV=sandbox

# GoAffPro (Phase 5)
GOAFFPRO_ADMIN_API_KEY=
GOAFFPRO_PUBLIC_TOKEN=

# Resend (Phase 9)
RESEND_API_KEY=
RESEND_AUDIENCE_ID=

# SMS (Phase 9) — already running via sms-edge
SMSGATE_USER=
SMSGATE_PASS=
SMSGATE_BASE_URL=https://sms.relentnet.dev

# Discord (Phase 9)
DISCORD_ORDER_WEBHOOK_URL=

# TaxJar (Phase 15 — admin-toggled)
TAXJAR_API_KEY=
```

- [ ] **Step 5.4: Write the env-loader test**

Create `tests/env.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('env loader', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('parses a valid DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db'
    const mod = await import('../src/lib/env')
    expect(mod.env.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db')
  })

  it('defaults NEXT_PUBLIC_SITE_URL to localhost', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db'
    delete process.env.NEXT_PUBLIC_SITE_URL
    const mod = await import('../src/lib/env')
    expect(mod.env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
  })

  it('throws on missing DATABASE_URL', async () => {
    delete process.env.DATABASE_URL
    await expect(import('../src/lib/env')).rejects.toThrow('Invalid environment configuration')
  })
})
```

- [ ] **Step 5.5: Run env tests — expect them to pass**

Run:
```bash
pnpm test tests/env.test.ts
```

Expected: 3 passed.

- [ ] **Step 5.6: Commit**

```bash
git add .
git commit -m "Task 5: Env validation via zod

- src/lib/env.ts with typed env schema
- Defaults for local-dev URLs
- .env.example committed; .env.local stays ignored
- Tests verify parsing, defaults, and validation errors"
```

---

## Task 6: Postgres + Drizzle ORM

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/lib/db/client.ts`
- Create: `src/lib/db/schema.ts`
- Modify: `package.json` (add deps)

- [ ] **Step 6.1: Install Drizzle and Postgres driver**

Run:
```bash
pnpm add drizzle-orm@^0.36 postgres@^3.4
pnpm add -D drizzle-kit@^0.28
```

- [ ] **Step 6.2: Create drizzle.config.ts**

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://animeniacs:animeniacs@localhost:5432/animeniacs'
  },
  verbose: true,
  strict: true
} satisfies Config
```

- [ ] **Step 6.3: Create src/lib/db/schema.ts (initial site_settings table)**

```typescript
import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by')
})

export type SiteSetting = typeof siteSettings.$inferSelect
export type NewSiteSetting = typeof siteSettings.$inferInsert
```

- [ ] **Step 6.4: Create src/lib/db/client.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10
})

export const db = drizzle(queryClient, { schema })
export type DB = typeof db
```

- [ ] **Step 6.5: Generate initial migration**

(Cannot run until Docker Postgres is up — see Task 9. For now, just confirm the schema compiles.)

Run:
```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 6.6: Commit**

```bash
git add .
git commit -m "Task 6: Drizzle ORM + Postgres driver

- drizzle.config.ts pointing at src/lib/db/schema.ts
- Initial schema: site_settings table (key-value store)
- DB client with connection pool
- Migration generation deferred to Task 9 (post-Docker)"
```

---

## Task 7: Markdown content loader

The 12 static content pages (about, FAQ, terms, etc.) are sourced from `docs/superpowers/specs/static-content-source/*.md` (already committed). Build them into renderable JSON at build time.

**Files:**
- Create: `scripts/content-build.ts`
- Create: `src/lib/content.ts`
- Create: `src/components/content/MarkdownPage.tsx`
- Modify: `package.json` (add deps)

- [ ] **Step 7.1: Install markdown deps**

Run:
```bash
pnpm add gray-matter@^4 marked@^15
pnpm add -D tsx@^4 isomorphic-dompurify@^2
```

Sanitization happens at build time in `scripts/content-build.ts`, so `isomorphic-dompurify` (which transitively pulls `dompurify` + `jsdom`) is a build-time-only dep. Keeping it out of `dependencies` avoids jsdom in the Next.js server runtime bundle (jsdom's synchronous `readFileSync` on a CSS file fails in Next's webpack server bundle).

- [ ] **Step 7.2: Create scripts/content-build.ts**

```typescript
#!/usr/bin/env tsx
/**
 * Reads markdown files from docs/superpowers/specs/static-content-source/
 * and writes a JSON manifest to src/lib/generated/content-manifest.json.
 * Runs as `prebuild` step (see package.json).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

const SOURCE_DIR = path.resolve('docs/superpowers/specs/static-content-source')
const OUTPUT_DIR = path.resolve('src/lib/generated')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'content-manifest.json')

type ContentEntry = {
  slug: string
  title: string
  html: string
}

async function build(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const files = await fs.readdir(SOURCE_DIR)
  files.sort()
  const manifest: Record<string, ContentEntry> = {}

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const slug = file.replace(/\.md$/, '')
    const raw = await fs.readFile(path.join(SOURCE_DIR, file), 'utf-8')
    const { content, data } = matter(raw)
    const html = await marked.parse(content)
    const safeHtml = DOMPurify.sanitize(html)
    // First H1 in the source becomes the title; fall back to filename.
    const titleMatch = content.match(/^#\s+(.+)$/m)
    const title = (data.title as string) ?? titleMatch?.[1] ?? slug.replace(/-/g, ' ')
    manifest[slug] = { slug, title, html: safeHtml }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2))
  console.log(`Built ${Object.keys(manifest).length} content pages → ${OUTPUT_FILE}`)
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 7.3: Add `src/lib/generated/` to .gitignore**

Append to `.gitignore`:
```
# Generated content
src/lib/generated/
```

- [ ] **Step 7.4: Run the content build**

Run:
```bash
pnpm content:build
```

Expected: `Built 12 content pages → src/lib/generated/content-manifest.json`. Verify the file exists:

```bash
ls -la src/lib/generated/content-manifest.json
```

- [ ] **Step 7.5: Create src/lib/content.ts**

```typescript
import manifest from '@/lib/generated/content-manifest.json'

export type ContentEntry = {
  slug: string
  title: string
  html: string
}

const typed = manifest as Record<string, ContentEntry>

export function getContent(slug: string): ContentEntry | null {
  return typed[slug] ?? null
}

export function listContent(): ContentEntry[] {
  return Object.values(typed)
}
```

- [ ] **Step 7.6: Create src/components/content/MarkdownPage.tsx**

```tsx
import type { ContentEntry } from '@/lib/content'

export function MarkdownPage({ content }: { content: ContentEntry }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <div
        className="prose"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at build time in scripts/content-build.ts
        dangerouslySetInnerHTML={{ __html: content.html }}
      />
    </article>
  )
}
```

HTML is pre-sanitized by `scripts/content-build.ts` and stored in the manifest, so this component renders trusted HTML directly with no runtime sanitization dependency. This avoids pulling `jsdom` (via `isomorphic-dompurify`) into the Next.js server bundle, where its synchronous `readFileSync` on a CSS file fails.

- [ ] **Step 7.7: Write content loader test**

Create `tests/content.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getContent, listContent } from '@/lib/content'

describe('content loader', () => {
  it('lists all 12 static content pages', () => {
    const entries = listContent()
    expect(entries.length).toBe(12)
  })

  it('finds the about-us page', () => {
    const entry = getContent('about-us')
    expect(entry).not.toBeNull()
    // Title is extracted from the first H1 of about-us.md (which is "# About Us").
    // The Animeniacs mention lives in the body content.
    expect(entry?.title).toBe('About Us')
    expect(entry?.html).toContain('Animeniacs')
  })

  it('returns null for unknown slug', () => {
    expect(getContent('nope-not-real')).toBeNull()
  })

  it('about-us html contains expected content', () => {
    const entry = getContent('about-us')
    expect(entry?.html).toContain('New Orleans')
  })
})
```

- [ ] **Step 7.8: Run content tests — expect them to pass**

Run:
```bash
pnpm test tests/content.test.ts
```

Expected: 4 passed.

- [ ] **Step 7.9: Commit**

```bash
git add .
git commit -m "Task 7: Markdown content loader

- prebuild script parses static-content-source/*.md to JSON and sanitizes HTML via DOMPurify at build time
- getContent/listContent helpers in src/lib/content.ts
- MarkdownPage component renders pre-sanitized HTML (no runtime sanitization dep)
- src/lib/generated/ is gitignored (build artifact)
- Tests cover happy path, missing slug, content correctness"
```

---

## Task 8: Static content page routes

Create one `page.tsx` per static-content page. Each is a 4-line file that loads the matching markdown.

**Files (create all 12):**
- `src/app/about-us/page.tsx`
- `src/app/b2b/page.tsx`
- `src/app/become-an-artist/page.tsx`
- `src/app/careers/page.tsx`
- `src/app/contact-us/page.tsx`
- `src/app/faqs/page.tsx`
- `src/app/how-to-display-our-art/page.tsx`
- `src/app/partner-with-us/page.tsx`
- `src/app/privacy-policy/page.tsx`
- `src/app/refund-return-policy/page.tsx`
- `src/app/shipping-policy/page.tsx`
- `src/app/terms-of-service/page.tsx`

- [ ] **Step 8.1: Create a single helper component for 404 case**

`src/components/content/MarkdownPage.tsx` was already created in Step 7.6 with build-time sanitization. No edits are needed here — Next.js will throw `notFound()` if content is missing, and the existing component is sufficient:

```tsx
import type { ContentEntry } from '@/lib/content'

export function MarkdownPage({ content }: { content: ContentEntry }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <div
        className="prose"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at build time in scripts/content-build.ts
        dangerouslySetInnerHTML={{ __html: content.html }}
      />
    </article>
  )
}
```

- [ ] **Step 8.2: Create src/app/about-us/page.tsx**

```tsx
import { notFound } from 'next/navigation'
import { getContent } from '@/lib/content'
import { MarkdownPage } from '@/components/content/MarkdownPage'

export const metadata = { title: 'About Us | Animeniacs' }

export default function Page() {
  const content = getContent('about-us')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
```

- [ ] **Step 8.3: Create the remaining 11 page files**

For each slug below, create `src/app/<slug>/page.tsx` with the same template as Step 8.2, swapping the slug and title:

| Slug | Title |
|------|-------|
| `b2b` | `B2B Inquiries \| Animeniacs` |
| `become-an-artist` | `Become an Artist \| Animeniacs` |
| `careers` | `Careers \| Animeniacs` |
| `contact-us` | `Contact Us \| Animeniacs` |
| `faqs` | `FAQs \| Animeniacs` |
| `how-to-display-our-art` | `How to Display Your Art \| Animeniacs` |
| `partner-with-us` | `Partner with Us \| Animeniacs` |
| `privacy-policy` | `Privacy Policy \| Animeniacs` |
| `refund-return-policy` | `Refund & Return Policy \| Animeniacs` |
| `shipping-policy` | `Shipping Policy \| Animeniacs` |
| `terms-of-service` | `Terms of Service \| Animeniacs` |

(All 12 page files are identical except for the slug string and `metadata.title`.)

- [ ] **Step 8.4: Create src/app/twitch/route.ts (server redirect)**

```typescript
import { redirect } from 'next/navigation'

export function GET(): never {
  redirect('https://twitch.tv/GeauxGamerLA')
}
```

- [ ] **Step 8.5: Create src/app/api/health/route.ts**

```typescript
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'animeniacs-app',
    version: process.env.npm_package_version ?? '0.0.0',
    uptimeSec: Math.floor(process.uptime())
  })
}
```

- [ ] **Step 8.6: Write a test that verifies every content slug has a matching route file**

Create `tests/pages/static-pages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { listContent } from '@/lib/content'

describe('static page routes', () => {
  it('every content entry has a corresponding app/<slug>/page.tsx', () => {
    const entries = listContent()
    const missing: string[] = []
    for (const entry of entries) {
      const filePath = path.resolve('src/app', entry.slug, 'page.tsx')
      if (!fs.existsSync(filePath)) missing.push(entry.slug)
    }
    expect(missing).toEqual([])
  })
})
```

- [ ] **Step 8.7: Run the test**

Run:
```bash
pnpm test tests/pages/static-pages.test.ts
```

Expected: 1 passed. If anything is missing, the test names which slugs lack a `page.tsx`.

- [ ] **Step 8.8: Boot the dev server and spot-check**

Run `pnpm dev`. Visit `http://localhost:3000/about-us`, `/faqs`, `/contact-us`, `/twitch` — first three render the markdown content. The `/twitch` route 302-redirects to `twitch.tv/GeauxGamerLA`.

Visit `http://localhost:3000/api/health` — returns the JSON with `ok: true`. Stop the server.

- [ ] **Step 8.9: Commit**

```bash
git add .
git commit -m "Task 8: Static content routes + /twitch redirect + /api/health

- 12 static content pages auto-render from generated manifest
- /twitch is a server redirect to twitch.tv/GeauxGamerLA
- /api/health used by Docker liveness probe
- Test verifies every content slug has a matching route"
```

---

## Task 9: Docker Compose — Postgres only first

We bring Postgres up first, run the initial migration, validate the connection. Then layer Logto, Plausible, and the Next.js app in subsequent tasks.

**Files:**
- Create: `compose.yml`
- Create: `.env.local` (gitignored)

- [ ] **Step 9.1: Create compose.yml (Postgres-only initial)**

```yaml
name: animeniacs

services:
  postgres:
    image: postgres:16-alpine
    container_name: animeniacs-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-animeniacs}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-animeniacs}
      POSTGRES_DB: ${POSTGRES_DB:-animeniacs}
      # Extra databases for Logto and Plausible (created via init script)
      POSTGRES_MULTIPLE_DATABASES: logto,plausible
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./docker/postgres/init-databases.sh:/docker-entrypoint-initdb.d/00-init-databases.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-animeniacs}"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 9.2: Create docker/postgres/init-databases.sh**

The official Postgres image supports only one database via `POSTGRES_DB`. We need extras for Logto and Plausible. This init script runs once on first container start.

```bash
#!/bin/bash
# Creates additional databases listed in POSTGRES_MULTIPLE_DATABASES.
# Runs only on first container init (volume is empty).
set -euo pipefail

if [ -z "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  echo "POSTGRES_MULTIPLE_DATABASES not set; skipping extra database creation"
  exit 0
fi

IFS=',' read -ra DBS <<< "$POSTGRES_MULTIPLE_DATABASES"
for db in "${DBS[@]}"; do
  echo "Creating database '$db'..."
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<EOSQL
    CREATE DATABASE "$db";
    GRANT ALL PRIVILEGES ON DATABASE "$db" TO "$POSTGRES_USER";
EOSQL
done
echo "Extra database creation complete."
```

Make it executable:

```bash
chmod +x docker/postgres/init-databases.sh
```

- [ ] **Step 9.3: Create .env.local for local-only secrets**

```bash
cat > .env.local <<'EOF'
# Local Docker Compose
POSTGRES_USER=animeniacs
POSTGRES_PASSWORD=animeniacs
POSTGRES_DB=animeniacs
POSTGRES_PORT=5432

# App
DATABASE_URL=postgres://animeniacs:animeniacs@localhost:5432/animeniacs
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Logto (placeholders; filled in Phase 7)
LOGTO_ENDPOINT=http://localhost:3001
LOGTO_COOKIE_SECRET=$(openssl rand -base64 48 | tr -d '\n')
EOF
```

Verify .env.local is gitignored:

```bash
git check-ignore .env.local
```

Expected: outputs `.env.local`.

- [ ] **Step 9.4: Bring Postgres up**

Run:
```bash
docker compose --env-file .env.local up -d postgres
```

Wait ~10 seconds, then verify it's healthy:

```bash
docker compose ps
```

Expected: `animeniacs-postgres` shows `Up (healthy)`.

- [ ] **Step 9.5: Verify the extra databases were created**

Run:
```bash
docker exec -it animeniacs-postgres psql -U animeniacs -l
```

Expected: list includes `animeniacs`, `logto`, `plausible`. Exit psql with `\q`.

- [ ] **Step 9.6: Generate and apply the initial Drizzle migration**

Run:
```bash
pnpm db:generate
```

Expected: creates `drizzle/migrations/0000_*.sql` with the `site_settings` CREATE TABLE.

Then apply:
```bash
pnpm db:push
```

Expected: `Changes applied`. Verify in psql:

```bash
docker exec -it animeniacs-postgres psql -U animeniacs -d animeniacs -c "\d site_settings"
```

Expected: shows the table structure.

- [ ] **Step 9.7: Write an integration test for the DB connection**

Create `tests/db.integration.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { siteSettings } from '@/lib/db/schema'

describe('database connection', () => {
  it('can write and read a site_settings row', async () => {
    await db.insert(siteSettings).values({ key: 'test-key', value: { hello: 'world' } })
    const rows = await db.select().from(siteSettings)
    const row = rows.find((r) => r.key === 'test-key')
    expect(row?.value).toEqual({ hello: 'world' })
  })

  afterAll(async () => {
    await db.delete(siteSettings)
  })
})
```

- [ ] **Step 9.8: Run the integration test**

Run:
```bash
DATABASE_URL="postgres://animeniacs:animeniacs@localhost:5432/animeniacs" pnpm test tests/db.integration.test.ts
```

Expected: 1 passed.

- [ ] **Step 9.9: Commit**

```bash
git add .
git commit -m "Task 9: Docker Compose — Postgres up, Drizzle migration applied

- compose.yml with Postgres 16
- Init script creates extra DBs for Logto and Plausible
- .env.local seeded (gitignored)
- Initial migration creates site_settings table
- Integration test confirms read/write round-trip"
```

---

## Task 10: Header + Footer + Navigation

The spec §22 defines navigation and footer structure precisely. Build minimal, functional, no styling beyond Tailwind defaults.

**Files:**
- Create: `src/components/layout/Header.tsx`
- Create: `src/components/layout/Footer.tsx`
- Create: `src/components/layout/NewsletterSignupStub.tsx`
- Modify: `src/app/layout.tsx` (include Header/Footer)

- [ ] **Step 10.1: Create Header**

```tsx
// src/components/layout/Header.tsx
import Link from 'next/link'

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold">
          Animeniacs
        </Link>
        <nav aria-label="Primary">
          <ul className="flex gap-4 text-sm">
            <li><Link href="/">Home</Link></li>
            <li><Link href="/shop">Shop</Link></li>
            <li><Link href="/artist">Artists</Link></li>
            <li><Link href="/custom/acrylic">Custom Acrylic</Link></li>
            <li><Link href="/custom/stickers">Custom Stickers</Link></li>
            <li><Link href="/account" aria-label="Account">Account</Link></li>
            <li><Link href="/cart" aria-label="Cart">Cart</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 10.2: Create NewsletterSignupStub**

```tsx
// src/components/layout/NewsletterSignupStub.tsx
'use client'

export function NewsletterSignupStub() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Real submission wired up in Phase 9
    alert('Newsletter signup wires up in Phase 9.')
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="newsletter-email" className="sr-only">Email</label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="you@example.com"
        className="rounded border border-gray-300 px-3 py-1 text-sm"
      />
      <button type="submit" className="rounded border border-gray-300 bg-gray-100 px-3 py-1 text-sm">
        Subscribe
      </button>
    </form>
  )
}
```

- [ ] **Step 10.3: Create Footer**

```tsx
// src/components/layout/Footer.tsx
import Link from 'next/link'
import { NewsletterSignupStub } from './NewsletterSignupStub'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <section aria-labelledby="footer-help">
          <h2 id="footer-help" className="text-sm font-semibold uppercase">Need Help</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li><Link href="/how-to-display-our-art">How to Display Your Art</Link></li>
            <li><Link href="/faqs">FAQs</Link></li>
            <li><Link href="/contact-us">Contact Us</Link></li>
          </ul>
        </section>

        <section aria-labelledby="footer-follow">
          <h2 id="footer-follow" className="text-sm font-semibold uppercase">Follow Us</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li><a href="https://instagram.com/animeniacs.shop" target="_blank" rel="noreferrer">Instagram</a></li>
            <li><a href="https://facebook.com/Animeniacs.shop" target="_blank" rel="noreferrer">Facebook</a></li>
            <li><Link href="/twitch">Twitch</Link></li>
            <li><a href="https://discord.gg/VAwd8sJp" target="_blank" rel="noreferrer">Discord</a></li>
          </ul>
        </section>

        <section aria-labelledby="footer-partner">
          <h2 id="footer-partner" className="text-sm font-semibold uppercase">Partner with Us</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li><Link href="/partner-with-us">Partner with Us</Link></li>
            <li><a href="https://affiliates.animeniacs.shop" target="_blank" rel="noreferrer">Become an Artist</a></li>
            <li><Link href="/b2b">B2B</Link></li>
            <li><a href="https://affiliates.animeniacs.shop/program-legal/terms" target="_blank" rel="noreferrer">Artist Agreement</a></li>
            <li><Link href="/careers">Careers</Link></li>
          </ul>
        </section>

        <section aria-labelledby="footer-info">
          <h2 id="footer-info" className="text-sm font-semibold uppercase">Info</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li><Link href="/about-us">About Us</Link></li>
            <li><Link href="/terms-of-service">Terms of Service</Link></li>
            <li><Link href="/privacy-policy">Privacy Policy</Link></li>
            <li><Link href="/shipping-policy">Shipping Policy</Link></li>
            <li><Link href="/refund-return-policy">Refund & Return Policy</Link></li>
          </ul>
        </section>
      </div>

      <div className="border-t border-gray-200">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-6 text-sm md:flex-row md:items-center">
          <NewsletterSignupStub />
          <p>© {new Date().getFullYear()} Animeniacs</p>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 10.4: Update src/app/layout.tsx to include Header and Footer**

```tsx
import type { Metadata } from 'next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import './globals.css'

export const metadata: Metadata = {
  title: 'Animeniacs',
  description: 'Fandom at its best — anime art, gaming gear, and more.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  )
}
```

- [ ] **Step 10.5: Write a smoke test for Header**

Create `tests/header.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from '@/components/layout/Header'

describe('Header', () => {
  it('renders the brand name', () => {
    render(<Header />)
    expect(screen.getByText('Animeniacs')).toBeInTheDocument()
  })

  it('includes primary navigation links', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: 'Shop' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Artists' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cart' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 10.6: Write a smoke test for Footer**

Create `tests/footer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'

describe('Footer', () => {
  it('has all four column headers', () => {
    render(<Footer />)
    expect(screen.getByText('Need Help')).toBeInTheDocument()
    expect(screen.getByText('Follow Us')).toBeInTheDocument()
    expect(screen.getByText('Partner with Us')).toBeInTheDocument()
    expect(screen.getByText('Info')).toBeInTheDocument()
  })

  it('links to all required Info pages', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'About Us' })).toHaveAttribute('href', '/about-us')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms-of-service')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy-policy')
    expect(screen.getByRole('link', { name: 'Shipping Policy' })).toHaveAttribute('href', '/shipping-policy')
    expect(screen.getByRole('link', { name: 'Refund & Return Policy' })).toHaveAttribute('href', '/refund-return-policy')
  })

  it('renders current year', () => {
    render(<Footer />)
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument()
  })
})
```

- [ ] **Step 10.7: Run all tests**

Run:
```bash
pnpm test
```

Expected: all tests pass (smoke + env + content + static-pages + header + footer + db.integration).

- [ ] **Step 10.8: Visual spot-check**

Run `pnpm dev`. Visit `localhost:3000` — see header with nav links + homepage stub + footer with all four columns and newsletter form. Click a footer link (e.g., About Us) — should navigate and render the markdown content. Stop the server.

- [ ] **Step 10.9: Commit**

```bash
git add .
git commit -m "Task 10: Header + Footer + navigation shell

- Spec §22 navigation structure: Home / Shop / Artists / Custom* / Account / Cart
- Footer 4 columns: Need Help / Follow Us / Partner / Info
- Newsletter signup stub (wires to Phase 9)
- Discord link uses GG one per user decision (admin-editable in Phase 12)
- Header + Footer tests with role-based queries"
```

---

## Task 11: Dockerfile for the Next.js app (multi-stage)

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 11.1: Create .dockerignore**

```
.git
.next
node_modules
.env*.local
docs
README.md
*.log
.vscode
.idea
.DS_Store
docker
drizzle
```

(`drizzle` is the generated migrations directory — these get copied separately in the production build step via `pnpm db:migrate` if needed. For dev, the volume mount handles it.)

- [ ] **Step 11.2: Create Dockerfile**

Multi-stage: deps → builder → runner. Uses Next.js standalone output for tiny final image.

First, enable standalone output in `next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    typedRoutes: true
  },
  images: {
    remotePatterns: []
  }
}

export default config
```

Then create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7

# --- Stage 1: install dependencies ---
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Stage 2: build ---
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build content manifest then Next.js
RUN pnpm content:build
RUN pnpm build

# --- Stage 3: runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
```

- [ ] **Step 11.3: Build the image**

Run:
```bash
docker build -t animeniacs-app:dev .
```

Expected: builds successfully. Final stage image size should be < 200MB.

- [ ] **Step 11.4: Run a one-off container to verify**

Run:
```bash
docker run --rm -p 3001:3000 \
  -e DATABASE_URL=postgres://animeniacs:animeniacs@host.docker.internal:5432/animeniacs \
  -e NEXT_PUBLIC_SITE_URL=http://localhost:3001 \
  -e LOGTO_COOKIE_SECRET=local_dev_secret_at_least_32_chars_long_xyz \
  animeniacs-app:dev
```

Open `http://localhost:3001` in browser. Should see the same site as `pnpm dev` did. Press Ctrl+C to stop.

- [ ] **Step 11.5: Commit**

```bash
git add .
git commit -m "Task 11: Dockerfile (multi-stage, standalone output)

- Stage 1: pnpm install with cache via deps stage
- Stage 2: content:build + next build → standalone
- Stage 3: minimal runner with non-root user, ~150MB
- Verified container serves site at port 3000"
```

---

## Task 12: Docker Compose — add Next.js app service

**Files:**
- Modify: `compose.yml`

- [ ] **Step 12.1: Update compose.yml to add the app service**

```yaml
name: animeniacs

services:
  postgres:
    image: postgres:16-alpine
    container_name: animeniacs-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-animeniacs}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-animeniacs}
      POSTGRES_DB: ${POSTGRES_DB:-animeniacs}
      POSTGRES_MULTIPLE_DATABASES: logto,plausible
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./docker/postgres/init-databases.sh:/docker-entrypoint-initdb.d/00-init-databases.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-animeniacs}"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: animeniacs-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER:-animeniacs}:${POSTGRES_PASSWORD:-animeniacs}@postgres:5432/${POSTGRES_DB:-animeniacs}
      NEXT_PUBLIC_SITE_URL: ${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}
      LOGTO_ENDPOINT: ${LOGTO_ENDPOINT:-http://localhost:3001}
      LOGTO_COOKIE_SECRET: ${LOGTO_COOKIE_SECRET}
      LOGTO_APP_ID: ${LOGTO_APP_ID:-}
      LOGTO_APP_SECRET: ${LOGTO_APP_SECRET:-}
    ports:
      - "${APP_PORT:-3000}:3000"
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://localhost:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 30s

volumes:
  postgres-data:
```

- [ ] **Step 12.2: Add wget to the runner stage of Dockerfile**

Edit the runner stage of `Dockerfile`:

Replace:
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
```

With:
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
```

(`wget` is needed for the healthcheck. Alpine doesn't include it by default.)

- [ ] **Step 12.3: Bring the full stack up**

Run:
```bash
docker compose --env-file .env.local up -d --build
```

Wait ~60 seconds for build + boot. Then check status:

```bash
docker compose ps
```

Expected: both `animeniacs-postgres` and `animeniacs-app` show `Up (healthy)`.

- [ ] **Step 12.4: Smoke-test via curl**

Run:
```bash
curl -sf http://localhost:3000/api/health | head
curl -sf http://localhost:3000/about-us | grep -o '<title>[^<]*</title>'
```

Expected:
- `/api/health` returns `{"ok":true,"service":"animeniacs-app",...}`
- About Us page title contains "About Us | Animeniacs"

- [ ] **Step 12.5: Tear down and bring up again to verify no first-run-only assumptions**

Run:
```bash
docker compose down
docker compose --env-file .env.local up -d
sleep 30
docker compose ps
```

Both services should still come up healthy on second run (this verifies Postgres init script doesn't break on existing data).

- [ ] **Step 12.6: Commit**

```bash
git add .
git commit -m "Task 12: Docker Compose adds Next.js app service

- App depends_on Postgres healthy
- Healthcheck via /api/health
- Compose builds the local Dockerfile (one source of truth)
- Tested cold start, healthy state, restart cycle"
```

---

## Task 13: Docker Compose — add Logto service

Logto needs Postgres (provided), an admin port (3002), and a tenant port (3001). On first run, the admin console requires creating an initial owner account.

**Files:**
- Modify: `compose.yml`

- [ ] **Step 13.1: Add Logto service to compose.yml**

Insert this service block under `app:` (alphabetical order would put it after, but ordering doesn't matter to Compose):

```yaml
  logto:
    image: svhd/logto:1.23
    container_name: animeniacs-logto
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      TRUST_PROXY_HEADER: "1"
      DB_URL: postgres://${POSTGRES_USER:-animeniacs}:${POSTGRES_PASSWORD:-animeniacs}@postgres:5432/logto
      ENDPOINT: ${LOGTO_ENDPOINT:-http://localhost:3001}
      ADMIN_ENDPOINT: ${LOGTO_ADMIN_ENDPOINT:-http://localhost:3002}
    entrypoint: ["sh", "-c", "npm run cli db seed -- --swe && npm start"]
    ports:
      - "${LOGTO_PORT:-3001}:3001"
      - "${LOGTO_ADMIN_PORT:-3002}:3002"
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://localhost:3001/api/status || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 60s
```

The `entrypoint` runs `db seed --swe` (Sign-up With Email enabled) before starting — idempotent, safe to re-run.

- [ ] **Step 13.2: Add Logto ports to .env.local (already there from earlier; verify)**

Check `.env.local` contains:

```
LOGTO_ENDPOINT=http://localhost:3001
LOGTO_ADMIN_ENDPOINT=http://localhost:3002
LOGTO_PORT=3001
LOGTO_ADMIN_PORT=3002
```

If not, append them.

- [ ] **Step 13.3: Bring Logto up**

Run:
```bash
docker compose --env-file .env.local up -d logto
```

Wait ~90 seconds (first-run seeds the DB). Then:

```bash
docker compose ps logto
```

Expected: `Up (healthy)`.

- [ ] **Step 13.4: Create the Logto admin account**

Visit `http://localhost:3002` in your browser. Logto's first-time setup screen will appear, prompting you to create an owner account.

Use a memorable local-dev password. **Save the credentials to your password manager.** This account exists in your local DB only and won't be in production.

- [ ] **Step 13.5: Create the Animeniacs application in Logto**

Inside the Logto admin console:
1. Go to **Applications** → **Create application**.
2. Choose **Next.js (App Router)** → **Traditional Web**.
3. Name: `Animeniacs Shop`.
4. Save the **App ID** and **App Secret** displayed — these go into `.env.local` as `LOGTO_APP_ID` and `LOGTO_APP_SECRET`.
5. Set the redirect URI to `http://localhost:3000/callback`.
6. Set the post sign-out redirect URI to `http://localhost:3000/`.

(Full Logto SDK wiring happens in Phase 7; for now we only verify the service is reachable and configurable.)

- [ ] **Step 13.6: Update .env.local with Logto app credentials**

Append the `LOGTO_APP_ID` and `LOGTO_APP_SECRET` values from Step 13.5 to `.env.local`.

- [ ] **Step 13.7: Commit (compose.yml only — .env.local stays gitignored)**

```bash
git add compose.yml .env.local || true  # .env.local won't get added; that's expected
git status  # verify only compose.yml is staged
git commit -m "Task 13: Docker Compose adds Logto service

- svhd/logto:1.23 with auto-seed on first run
- Postgres logto DB pre-created by init script
- Admin console at :3002, tenant API at :3001
- Manual: create owner account + Animeniacs application
  in Logto admin (recorded in personal password manager)"
```

---

## Task 14: Docker Compose — add Plausible service

Plausible CE needs ClickHouse (separate container) + Postgres metadata (we have it) + the Plausible app itself.

**Files:**
- Modify: `compose.yml`
- Create: `docker/plausible/plausible-conf.env`
- Create: `docker/plausible/clickhouse-config.xml`
- Create: `docker/plausible/clickhouse-user-config.xml`

- [ ] **Step 14.1: Create docker/plausible/plausible-conf.env**

This is a separate env file Plausible mounts directly. Secrets go here, all committed-or-not depending on policy. We commit the file as a template with safe defaults; the actual `SECRET_KEY_BASE` lives in `.env.local`.

```bash
# Plausible config (loaded by the plausible-app service)
# Secrets like SECRET_KEY_BASE are interpolated from .env.local via docker-compose.
BASE_URL=http://localhost:8000
DISABLE_REGISTRATION=invite_only
LISTEN_IP=0.0.0.0
DATABASE_URL=postgres://animeniacs:animeniacs@postgres:5432/plausible
CLICKHOUSE_DATABASE_URL=http://plausible-clickhouse:8123/plausible_events_db
```

- [ ] **Step 14.2: Create docker/plausible/clickhouse-config.xml**

Minimal ClickHouse config for low-resource local dev.

```xml
<clickhouse>
    <logger>
        <level>warning</level>
        <console>true</console>
    </logger>
    <listen_host>0.0.0.0</listen_host>
    <merge_tree>
        <max_suspicious_broken_parts>5</max_suspicious_broken_parts>
    </merge_tree>
</clickhouse>
```

- [ ] **Step 14.3: Create docker/plausible/clickhouse-user-config.xml**

```xml
<clickhouse>
    <profiles>
        <default>
            <log_queries>0</log_queries>
            <log_query_threads>0</log_query_threads>
        </default>
    </profiles>
</clickhouse>
```

- [ ] **Step 14.4: Append Plausible services to compose.yml**

```yaml
  plausible-clickhouse:
    image: clickhouse/clickhouse-server:24.3-alpine
    container_name: animeniacs-plausible-clickhouse
    restart: unless-stopped
    volumes:
      - plausible-clickhouse-data:/var/lib/clickhouse
      - ./docker/plausible/clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml:ro
      - ./docker/plausible/clickhouse-user-config.xml:/etc/clickhouse-server/users.d/logging.xml:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8123/ping"]
      interval: 10s
      timeout: 5s
      retries: 6

  plausible:
    image: ghcr.io/plausible/community-edition:v2.1
    container_name: animeniacs-plausible
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      plausible-clickhouse:
        condition: service_healthy
    env_file:
      - ./docker/plausible/plausible-conf.env
    environment:
      SECRET_KEY_BASE: ${PLAUSIBLE_SECRET_KEY_BASE}
      TOTP_VAULT_KEY: ${PLAUSIBLE_TOTP_VAULT_KEY}
    ports:
      - "${PLAUSIBLE_PORT:-8000}:8000"
    command: sh -c "/entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"

volumes:
  postgres-data:
  plausible-clickhouse-data:
```

- [ ] **Step 14.5: Generate Plausible secrets and add to .env.local**

Run:
```bash
echo "PLAUSIBLE_SECRET_KEY_BASE=$(openssl rand -base64 64 | tr -d '\n')" >> .env.local
echo "PLAUSIBLE_TOTP_VAULT_KEY=$(openssl rand -base64 32 | tr -d '\n')" >> .env.local
echo "PLAUSIBLE_PORT=8000" >> .env.local
```

- [ ] **Step 14.6: Bring Plausible up**

Run:
```bash
docker compose --env-file .env.local up -d plausible-clickhouse
sleep 20
docker compose --env-file .env.local up -d plausible
sleep 60
docker compose ps
```

Expected: all services (postgres, app, logto, plausible-clickhouse, plausible) are `Up`.

- [ ] **Step 14.7: Create the Plausible admin user**

Visit `http://localhost:8000` in your browser. The first signup creates the admin account. Create your account, verify the email skip (CE allows this), and add a site:
- Domain: `animeniacs.shop`
- Timezone: America/Chicago

You'll be given a tracking snippet that uses `https://localhost:8000/js/script.js`. **For local dev, our app will load that script from `localhost:8000`. For production we'll change the data-domain to `animeniacs.shop` and point at `analytics.animeniacs.shop`.** Setting this up in code is in Phase 10.

- [ ] **Step 14.8: Commit**

```bash
git add compose.yml docker/plausible/
git commit -m "Task 14: Docker Compose adds Plausible CE + ClickHouse

- ClickHouse 24.3 for analytics events store
- Plausible CE v2.1 connected to shared Postgres for metadata
- Local-dev secrets in .env.local; container config in docker/plausible/
- Manual: create admin account + site (animeniacs.shop) in Plausible UI"
```

---

## Task 15: README — local dev quickstart

**Files:**
- Modify: `README.md`

- [ ] **Step 15.1: Replace README.md with expanded setup instructions**

```markdown
# Animeniacs Shop

Custom Next.js e-commerce site replacing the current `animeniacs.shop` WordPress/WooCommerce site.

## Local development

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker 24+ with Compose v2.20+
- macOS / Linux

### First-time setup

```bash
# 1. Install Node deps
pnpm install

# 2. Create .env.local from template
cp .env.example .env.local
# Then edit .env.local to fill in:
#   LOGTO_COOKIE_SECRET   (run: openssl rand -base64 48)
#   PLAUSIBLE_SECRET_KEY_BASE  (run: openssl rand -base64 64)
#   PLAUSIBLE_TOTP_VAULT_KEY   (run: openssl rand -base64 32)

# 3. Build content manifest
pnpm content:build

# 4. Bring up the local stack
docker compose --env-file .env.local up -d

# 5. Apply DB migrations
pnpm db:push

# 6. Visit the services
open http://localhost:3000   # Next.js app
open http://localhost:3001   # Logto tenant API (the SDK uses this)
open http://localhost:3002   # Logto admin console (create owner here)
open http://localhost:8000   # Plausible (create admin here)
```

### Daily development

```bash
# Run the dev server (auto-reload) outside of Docker.
# Docker still runs Postgres, Logto, Plausible. Only the app runs natively
# for fastest reload cycles.
docker compose --env-file .env.local up -d postgres logto plausible plausible-clickhouse
pnpm dev
```

### Tests

```bash
pnpm test              # all tests once
pnpm test:watch        # watch mode
pnpm typecheck         # tsc --noEmit
pnpm lint              # biome check
```

### Common ops

```bash
# Tail logs
docker compose logs -f app

# Reset everything (DESTRUCTIVE)
docker compose down -v
rm -rf .next src/lib/generated drizzle/migrations
pnpm db:generate
docker compose --env-file .env.local up -d
pnpm db:push

# Drizzle Studio (DB GUI)
pnpm db:studio
```

## Production deploy (Coolify)

The same `compose.yml` deploys to Coolify. Set the production env vars in Coolify's UI (TLS-protected). Coolify adds `SERVICE_FQDN_*` vars automatically; the app reads them via `NEXT_PUBLIC_SITE_URL`.

## Documentation

- [Design Spec](./docs/superpowers/specs/2025-05-13-animeniacs-shop-design.md)
- [Phase 1: Foundation Plan](./docs/superpowers/plans/2025-05-13-phase-01-foundation.md)
- [Static Content Sources](./docs/superpowers/specs/static-content-source/)
```

- [ ] **Step 15.2: Commit**

```bash
git add README.md
git commit -m "Task 15: README — local dev quickstart

Covers first-time setup, daily flow, tests, and a destructive
reset procedure for when things get into a bad state."
```

---

## Task 16: End-to-end verification

Final sanity check that Phase 1 deliverables work together.

- [ ] **Step 16.1: Clean shutdown and full restart**

Run:
```bash
docker compose down
docker compose --env-file .env.local up -d --build
sleep 60
docker compose ps
```

Expected: all 5 services healthy. (postgres, app, logto, plausible-clickhouse, plausible)

- [ ] **Step 16.2: Smoke-test every static route**

Run:
```bash
for slug in about-us b2b become-an-artist careers contact-us faqs how-to-display-our-art partner-with-us privacy-policy refund-return-policy shipping-policy terms-of-service; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/$slug")
  echo "$slug: $status"
done
```

Expected: every line shows status `200`.

- [ ] **Step 16.3: Verify health endpoint**

```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```

Expected: JSON with `"ok": true`.

- [ ] **Step 16.4: Verify Twitch redirect**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/twitch
```

Expected: `307 https://twitch.tv/GeauxGamerLA` (or `302` depending on Next version).

- [ ] **Step 16.5: Verify Logto reachable**

```bash
curl -s http://localhost:3001/api/status | head -1
```

Expected: an HTTP 200 response body or a Logto status JSON.

- [ ] **Step 16.6: Verify Plausible reachable**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000
```

Expected: `200`.

- [ ] **Step 16.7: Run the full test suite one more time**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all green.

- [ ] **Step 16.8: Tag Phase 1 complete**

```bash
git tag -a phase-1-foundation -m "Phase 1 complete: local Docker Compose stack functional"
git log --oneline | head -20
```

The tag marks the milestone; no remote push yet (user direction).

---

## Phase 1 self-review

Before declaring Phase 1 done, verify against the spec:

- [ ] **Spec coverage check**
  - Spec §1 Tech Stack: Next.js, TypeScript, Postgres, Logto, Plausible, Resend (Phase 9), Square (Phase 3), GoAffPro (Phase 5), Antigro (Phase 16) — Foundation pieces in place; integrations deferred to later phases as planned. ✓
  - Spec §2 Page Map static pages: all 12 routes built. ✓
  - Spec §22 Navigation & Footer: built. ✓
  - Spec §10 Logto: service running, app registered, SDK wiring deferred to Phase 7. ✓
  - Spec §19 Plausible: service running, script integration deferred to Phase 10. ✓

- [ ] **Placeholder scan**
  - No `TODO`, `FIXME`, `TBD` left in code or this plan. ✓

- [ ] **Type consistency**
  - `ContentEntry` type used consistently across `content.ts`, `MarkdownPage.tsx`, `content-build.ts`. ✓

---

## Outcome

At this point:
- `docker compose --env-file .env.local up -d` starts the full local stack.
- `http://localhost:3000` shows the site shell with all 12 static content pages live.
- Postgres, Logto, Plausible are running and reachable.
- The same `compose.yml` is Coolify-ready (just needs production env vars).
- Tests, typecheck, and lint all pass.

## Next phases

Phase 1 stops here. Subsequent phases (each with their own plan doc) will build on this foundation:

- **Phase 2:** Database schemas for the rest of the app (wishlists, reviews, event_logos, sms_recipients, abandoned_carts, etc.) — no API keys needed.
- **Phase 3:** Square Catalog integration — **needs `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID` (sandbox)**.
- **Phase 4:** Public catalog UX (/shop, /product, mockup gallery) — no new keys.
- **Phase 5:** GoAffPro artist integration — **needs `GOAFFPRO_ADMIN_API_KEY` and `GOAFFPRO_PUBLIC_TOKEN`**.
- **Phase 6:** Cart, wishlist, recently-viewed (client-side) — no keys.
- **Phase 7:** Logto SDK wiring + /account — no new keys (Logto already running).
- **Phase 8:** Checkout flow — uses Square keys from Phase 3.
- **Phase 9:** Notifications (Discord webhook + SMS + Resend) — **needs `DISCORD_ORDER_WEBHOOK_URL`, `SMSGATE_USER`/`SMSGATE_PASS`, `RESEND_API_KEY`/`RESEND_AUDIENCE_ID`**.
- **Phase 10:** Plausible analytics events — no new keys.
- **Phase 11:** Reviews system — no keys.
- **Phase 12:** Admin panel — no keys.
- **Phase 13:** Convention schedule / iCal — no keys.
- **Phase 14:** SEO — no keys.
- **Phase 15:** TaxJar (admin-toggled) — **optionally `TAXJAR_API_KEY` (free dev tier)**.
- **Phase 16:** Antigro custom-product stubs — no keys (Antigro deferred to v1.1).
- **Phase 17:** Coolify production deploy — needs production keys.

Each phase produces working software that ships locally. The earliest user-supplied API key request lands at Phase 3.
