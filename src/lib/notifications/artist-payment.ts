import 'server-only'
import type { FieldChange } from '@/lib/db/queries/artist-changes'
import { Resend } from 'resend'

/**
 * DAN-140: an ARTIST changed their payout details. Alerts admins (Discord if
 * configured + email to ADMIN_EMAILS) and emails the artist. Every channel is
 * best-effort: failures are console-logged and NEVER thrown, so the save that
 * triggered this is never blocked.
 */
export async function notifyArtistPaymentChange(opts: {
  artistName: string
  accountEmail: string | null
  changes: FieldChange[]
  at: Date
}): Promise<void> {
  const when = opts.at.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const lines = opts.changes.map(
    (c) => `${c.field}: ${c.oldValue ?? '(none)'} → ${c.newValue ?? '(none)'}`
  )
  const adminText = [
    `${opts.artistName} changed their payout details.`,
    '',
    ...lines,
    '',
    `Time: ${when} (Chicago)`,
    'Review it under Admin > Artists and click "Mark reviewed".'
  ].join('\n')

  const artistText = [
    'Hi,',
    '',
    `Your payout details were changed on ${when} (Chicago).`,
    `Fields: ${opts.changes.map((c) => c.field).join(', ')}`,
    '',
    "If this wasn't you, please contact us right away.",
    '',
    '— The Animeniacs Team'
  ].join('\n')

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  const send = async (to: string[], subject: string, text: string): Promise<void> => {
    if (!apiKey || !from) {
      console.warn('[artist-payment] RESEND_API_KEY or RESEND_FROM_EMAIL not set, skipping email')
      return
    }
    if (to.length === 0) return
    const res = await new Resend(apiKey).emails.send({ from, to, subject, text })
    if (res.error) throw new Error(res.error.message)
  }

  const discordUrl = process.env.DISCORD_ORDER_WEBHOOK_URL
  const jobs: Array<[string, Promise<unknown>]> = [
    ['admin email', send(adminEmails, `Payout details changed: ${opts.artistName}`, adminText)],
    [
      'artist email',
      opts.accountEmail
        ? send([opts.accountEmail], 'Your payout details were changed', artistText)
        : Promise.resolve()
    ]
  ]
  if (discordUrl) {
    jobs.push([
      'discord',
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: `Payout details changed: ${opts.artistName}`,
              description: `${lines.join('\n')}\n${when} (Chicago)`,
              color: 0xe17055,
              timestamp: opts.at.toISOString()
            }
          ]
        })
      })
    ])
  }
  const results = await Promise.allSettled(jobs.map(([, p]) => p))
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[artist-payment] ${jobs[i][0]} failed:`, r.reason)
  })
}
