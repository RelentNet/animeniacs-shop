import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

/**
 * Mock `next/font/google` globally. The "Street Gallery" redesign loads fonts
 * (Bebas Neue / Space Grotesk / Space Mono) in `src/app/layout.tsx`; under
 * jsdom the real loader isn't available (`Space_Grotesk is not a function`), so
 * any test importing the layout (e.g. segment-config) crashes. Each named font
 * factory returns the minimal shape components read (`className` / `variable`).
 */
vi.mock('next/font/google', () => {
  const font = () => ({ className: '', variable: '', style: { fontFamily: '' } })
  return { __esModule: true, Bebas_Neue: font, Space_Grotesk: font, Space_Mono: font }
})

/**
 * Stub the `next/navigation` client hooks globally. The cart drawer (mounted by
 * CartProvider, which many component tests render) now calls `useRouter()` for
 * the /checkout navigation; the real hook throws without an App Router context
 * under jsdom. We keep every real export (redirect/notFound/etc.) and override
 * only the hooks with inert versions. Tests that need specific routing behavior
 * still declare their own per-file `vi.mock('next/navigation', …)`, which wins.
 */
vi.mock('next/navigation', async (orig) => {
  const actual = await orig<typeof import('next/navigation')>()
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn()
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams()
  }
})

/**
 * Polyfill `window.localStorage` for jsdom tests.
 *
 * Why: Node 26+ ships native `localStorage` gated behind the
 * `--localstorage-file` CLI flag; without it, jsdom (v25.x) silently leaves
 * `globalThis.localStorage` undefined. Phase 6 introduced the first tests in
 * the repo that touch localStorage (cart state persists there), so we install
 * a small in-memory shim once at setup. The shim implements just enough of the
 * Web Storage API to satisfy zod-validated reads and round-trip writes.
 */
// Install when localStorage is missing OR present-but-broken. Some Node/jsdom
// combos expose a `localStorage` object that lacks a working `clear()` (e.g.
// Node's experimental Web Storage gated behind `--localstorage-file`), which the
// old `=== undefined` guard let through, crashing every test that clears storage.
function localStorageUsable(): boolean {
  try {
    return typeof window.localStorage?.clear === 'function' && typeof window.localStorage?.setItem === 'function'
  } catch {
    return false
  }
}

if (typeof window !== 'undefined' && !localStorageUsable()) {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>()
    get length(): number {
      return this.store.size
    }
    clear(): void {
      this.store.clear()
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? (this.store.get(key) as string) : null
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null
    }
    removeItem(key: string): void {
      this.store.delete(key)
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value))
    }
  }

  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true
  })
  // jsdom also exposes localStorage on the global; mirror it so unscoped
  // `localStorage.foo` calls in tests resolve identically to `window.localStorage`.
  Object.defineProperty(globalThis, 'localStorage', {
    value: window.localStorage,
    configurable: true,
    writable: true
  })
}
