import { redirect } from 'next/navigation'

// Run at request time (not statically prerendered) so the redirect reliably
// fires from the standalone runtime — a prerendered route-handler redirect was
// 404ing in the deployed build.
export const dynamic = 'force-dynamic'

/**
 * Short link for the printed/QR "Instagram" code: /qrinsta → the IG profile.
 * 307 (temporary) so the destination can be re-pointed later without browsers
 * caching it permanently.
 */
export function GET(): never {
  redirect('https://www.instagram.com/animeniacs.shop/')
}
