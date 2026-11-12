/**
 * Buyer phone normalization for Square's hosted checkout pre-fill.
 *
 * Square validates `pre_populated_data.buyer_phone_number` and ONLY accepts
 * numbers carrying a country code (E.164-style: `+14045550000`). A plain
 * ten-digit US number — what nearly every buyer types — is rejected with
 * `INVALID_PHONE_NUMBER`, which used to fail the whole checkout. The phone is
 * optional and purely a convenience pre-fill, so the contract here is:
 * return a Square-safe E.164 string, or `undefined` so the caller omits it.
 * It must never throw.
 *
 * Pure module (no I/O) — importable from server routes and tests.
 */

/** International dialing codes for the shippable countries (see countries.ts). */
const DIAL_CODES: Readonly<Record<string, string>> = {
  US: '1',
  PR: '1',
  CA: '1',
  GB: '44',
  AT: '43',
  BE: '32',
  BG: '359',
  HR: '385',
  CY: '357',
  CZ: '420',
  DK: '45',
  EE: '372',
  FI: '358',
  FR: '33',
  DE: '49',
  GR: '30',
  HU: '36',
  IE: '353',
  IT: '39',
  LV: '371',
  LT: '370',
  LU: '352',
  MT: '356',
  NL: '31',
  PL: '48',
  PT: '351',
  RO: '40',
  SK: '421',
  SI: '386',
  ES: '34',
  SE: '46'
}

/** E.164: "+" then 8–15 digits (the spec maximum is 15, including country code). */
const E164 = /^\+[1-9]\d{7,14}$/

/**
 * Normalize a buyer-typed phone to E.164 for the given ISO alpha-2 country.
 *
 * - Already international (`+1…`, `001…`, `00 44 …`) → cleaned and kept.
 * - Bare national number → prefixed with the country's dialing code. For
 *   NANP (US/PR/CA) a leading national `1` (`1 404 …`) is not doubled; for other
 *   countries a leading trunk `0` (`07700 900123`) is dropped.
 * - Anything that doesn't end up as a valid E.164 string → `undefined`.
 */
export function toE164Phone(
  raw: string | null | undefined,
  country: string | null | undefined
): string | undefined {
  const input = (raw ?? '').trim()
  if (!input) return undefined

  // Strip a trailing extension ("x123", "ext. 4") — Square can't carry it.
  const noExt = input.replace(/\s*(?:x|ext\.?|extension)\s*\d+\s*$/i, '')
  const international = noExt.startsWith('+') || /^00\d/.test(noExt)
  const digits = noExt.replace(/\D/g, '')
  if (!digits) return undefined

  let candidate: string
  if (international) {
    candidate = `+${noExt.startsWith('+') ? digits : digits.slice(2)}`
  } else {
    const code = DIAL_CODES[(country ?? '').trim().toUpperCase()]
    if (!code) return undefined
    let national = digits
    if (code === '1') {
      // NANP: accept "4045550000" and "14045550000" alike.
      if (national.length === 11 && national.startsWith('1')) national = national.slice(1)
      if (national.length !== 10) return undefined
    } else if (national.startsWith('0')) {
      national = national.replace(/^0+/, '')
    }
    candidate = `+${code}${national}`
  }

  return E164.test(candidate) ? candidate : undefined
}
