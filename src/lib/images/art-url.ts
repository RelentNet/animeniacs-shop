/**
 * Art-image proxy URL helpers (shared client + server).
 *
 * Product art is served through `/api/art?id=<squareImageId>` so the original
 * Square presigned S3 URL is NEVER handed to the client (it would otherwise leak
 * the full print-resolution original via `next/image`'s `?url=` param). The proxy
 * resolves the id → current Square URL server-side and downscales it (see
 * src/app/api/art/route.ts). Referencing by id (not URL) is SSRF-safe and stable
 * across Square's presigned-URL rotation.
 */

/** Square catalog object ids are uppercase base32-ish; be permissive but strict
 *  enough to reject anything that could be a path/URL (no `/ : . %`). */
const SQUARE_IMAGE_ID = /^[A-Za-z0-9_-]{8,64}$/

export function isValidSquareImageId(id: string | null | undefined): id is string {
  return typeof id === 'string' && SQUARE_IMAGE_ID.test(id)
}

/** Client-facing proxy URL for a Square IMAGE object id. */
export function artImageUrl(id: string): string {
  return `/api/art?id=${encodeURIComponent(id)}`
}

/** Default longest-edge cap (~"Facebook standard"): crisp on retina, below print
 *  resolution for the 16×24″ products. Override per-environment to tune
 *  protection vs. quality. */
export const DEFAULT_ART_MAX_EDGE = 2048

/** Configured cap on the longest edge (width OR height) for every served art
 *  image — protects portrait and landscape with one number. Clamped to a sane
 *  range so a bad env value can't disable protection or blow up memory. */
export function artMaxEdge(): number {
  const raw = Number(process.env.ART_IMAGE_MAX_EDGE)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_ART_MAX_EDGE
  return Math.min(4096, Math.max(256, Math.round(raw)))
}
