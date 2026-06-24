import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

/**
 * POST /api/revalidate
 *
 * Secured by the x-cron-secret header (same pattern as /api/cron/*). Pinged by
 * deploy.sh right after a new container is up to refill the ISR pages — which
 * prerender empty at build (the builder can't reach Postgres) and would
 * otherwise serve an empty/stale shell for up to `revalidate` (~5 min) after
 * every deploy.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const incoming = request.headers.get('x-cron-secret')
  if (!secret || incoming !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The ISR surfaces that prerender empty without a DB at build time.
  revalidatePath('/', 'layout') // promo bar + site-settings cache (whole tree)
  revalidatePath('/')
  revalidatePath('/shop')
  revalidatePath('/artist')
  revalidatePath('/artist/[slug]', 'page')
  revalidatePath('/category/[slug]', 'page')

  const revalidated = ['/', '/shop', '/artist', '/artist/[slug]', '/category/[slug]']
  return NextResponse.json({ revalidated })
}
