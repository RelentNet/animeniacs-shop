// Stub for `server-only` so Vitest can import modules guarded by it.
// In production, Next.js resolves the real `server-only` package, which throws
// when imported from a client bundle. Tests run in Node, so the stub is safe.
export {}
