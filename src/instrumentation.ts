/**
 * Next.js instrumentation hook (runs ONCE at server startup, before
 * any request handling). Used here for Phase 7.5 deploy diagnostics:
 * log which required env vars are present (not their values, just the
 * presence + length) so a crash-looping container reveals what's
 * actually wired up from the operator's Coolify env config.
 *
 * Remove this file (or gate to a debug flag) once the deploy is
 * stable — see Phase 7.5 handoff.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const keys = [
    'NODE_ENV',
    'DATABASE_URL',
    'NEXT_PUBLIC_SITE_URL',
    'LOGTO_ENDPOINT',
    'LOGTO_APP_ID',
    'LOGTO_APP_SECRET',
    'LOGTO_COOKIE_SECRET',
    'SQUARE_ENV',
    'SQUARE_ACCESS_TOKEN',
    'SQUARE_LOCATION_ID',
    'SQUARE_WEBHOOK_SIGNATURE_KEY',
    'DISCORD_ORDER_WEBHOOK_URL',
    'SMSEDGE_TOKEN',
    'SMSEDGE_BASE_URL'
  ] as const

  console.log('[startup] Phase 7.5 env diagnostic:')
  for (const k of keys) {
    const v = process.env[k]
    if (v === undefined) {
      console.log(`[startup]   ${k}: MISSING`)
    } else if (v === '') {
      console.log(`[startup]   ${k}: present-but-empty`)
    } else {
      console.log(`[startup]   ${k}: present (len=${v.length})`)
    }
  }
}
