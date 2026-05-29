import 'server-only'
import { db } from '@/lib/db/client'
import { type SmsRecipient, smsRecipients } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

export const SmsRecipientInputSchema = z.object({
  /** E.164 format: leading +, country code, then up to 14 digits. */
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'must be E.164 (e.g. +14155552671)'),
  label: z.string().max(60).nullable().optional(),
  enabled: z.boolean().default(true)
})

export type SmsRecipientInput = z.input<typeof SmsRecipientInputSchema>

export async function getAllSmsRecipients(): Promise<SmsRecipient[]> {
  return db.select().from(smsRecipients).orderBy(asc(smsRecipients.id))
}

export async function getEnabledRecipients(): Promise<SmsRecipient[]> {
  return db
    .select()
    .from(smsRecipients)
    .where(eq(smsRecipients.enabled, true))
    .orderBy(asc(smsRecipients.id))
}

export async function getSmsRecipientById(id: number): Promise<SmsRecipient | undefined> {
  const rows = await db.select().from(smsRecipients).where(eq(smsRecipients.id, id)).limit(1)
  return rows[0]
}

export async function createSmsRecipient(input: SmsRecipientInput): Promise<SmsRecipient> {
  const parsed = SmsRecipientInputSchema.parse(input)
  const [row] = await db
    .insert(smsRecipients)
    .values({
      phone: parsed.phone,
      label: parsed.label ?? null,
      enabled: parsed.enabled
    })
    .returning()
  return row
}

export async function updateSmsRecipient(
  id: number,
  input: Partial<SmsRecipientInput>
): Promise<SmsRecipient> {
  const parsed = SmsRecipientInputSchema.partial().parse(input)
  const patch: Partial<typeof smsRecipients.$inferInsert> = {}
  if (parsed.phone !== undefined) patch.phone = parsed.phone
  if (parsed.label !== undefined) patch.label = parsed.label ?? null
  if (parsed.enabled !== undefined) patch.enabled = parsed.enabled
  const [row] = await db
    .update(smsRecipients)
    .set(patch)
    .where(eq(smsRecipients.id, id))
    .returning()
  if (!row) throw new Error(`sms_recipients ${id} not found`)
  return row
}

export async function deleteSmsRecipient(id: number): Promise<void> {
  await db.delete(smsRecipients).where(eq(smsRecipients.id, id))
}
