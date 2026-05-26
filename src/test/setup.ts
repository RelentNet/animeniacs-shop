import '@testing-library/jest-dom/vitest'

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
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
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
