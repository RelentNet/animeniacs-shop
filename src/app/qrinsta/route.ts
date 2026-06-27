import { redirect } from 'next/navigation'

/**
 * Short link for the printed/QR "Instagram" code: /qrinsta → the IG profile.
 * 307 (temporary) so the destination can be re-pointed later without browsers
 * caching it permanently. Mirrors src/app/twitch/route.ts.
 */
export function GET(): never {
  redirect('https://www.instagram.com/animeniacs.shop/')
}
