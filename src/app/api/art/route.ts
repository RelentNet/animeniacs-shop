import { isValidSquareImageId } from '@/lib/images/art-url'
import { downscaleArtImage } from '@/lib/images/downscale'
import { resolveImageUrlCached } from '@/lib/square/items'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/art?id=<squareImageId>
 *
 * The art-protection wall. Product art is referenced by Square IMAGE object id
 * (never by url), so the original presigned Square url is never exposed to the
 * client. This route resolves the id → current Square url server-side (cached),
 * fetches the original, and downscales it with sharp so the LONGEST edge is
 * capped at `ART_IMAGE_MAX_EDGE` (default 2048) — protecting portrait and
 * landscape with one number. The print-resolution original is never served.
 *
 * SSRF-safe: only validated Square ids are accepted and resolved through our
 * authenticated Square client; no client-supplied url is ever fetched. Any
 * failure (bad id / unknown image / Square or sharp error) returns 404 so the
 * UI degrades to its placeholder rather than 500-ing the page.
 */
export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id')
  if (!isValidSquareImageId(id)) {
    return NextResponse.json({ error: 'Invalid image id' }, { status: 400 })
  }

  try {
    const sourceUrl = await resolveImageUrlCached(id)
    if (!sourceUrl) return new NextResponse(null, { status: 404 })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let upstream: Response
    try {
      upstream = await fetch(sourceUrl, { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
    if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: 404 })

    const output = await downscaleArtImage(Buffer.from(await upstream.arrayBuffer()))

    return new NextResponse(new Uint8Array(output), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  } catch (err) {
    console.error(`[api/art] failed for id ${id}:`, err)
    return new NextResponse(null, { status: 404 })
  }
}
