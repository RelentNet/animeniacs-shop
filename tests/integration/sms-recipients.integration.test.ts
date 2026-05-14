import { db } from '@/lib/db/client'
import { smsRecipients } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupByPrefix, testNamespace } from '../helpers/db'

const NS = testNamespace('sms')

// Phones must be unique numeric strings. We allocate a private +1 555-01 range
// (E.164 fictional reserved space) plus a counter that resets per test file.
let counter = 0
function nextPhone(): string {
  counter += 1
  return `+1555${String(Date.now()).slice(-7)}${String(counter).padStart(2, '0')}`
}

describe('sms_recipients integration', () => {
  it('inserts a recipient with defaults', async () => {
    const phone = nextPhone()
    const [row] = await db
      .insert(smsRecipients)
      .values({ phone, label: `${NS}_owner` })
      .returning()
    expect(row.phone).toBe(phone)
    expect(row.label).toBe(`${NS}_owner`)
    expect(row.enabled).toBe(true) // default
    expect(row.id).toBeGreaterThan(0)
  })

  it('enforces unique phone constraint', async () => {
    const phone = nextPhone()
    await db.insert(smsRecipients).values({ phone, label: `${NS}_dup_a` })
    await expect(db.insert(smsRecipients).values({ phone, label: `${NS}_dup_b` })).rejects.toThrow()
  })

  it('can disable a recipient', async () => {
    const phone = nextPhone()
    const [row] = await db
      .insert(smsRecipients)
      .values({ phone, label: `${NS}_disable_target` })
      .returning()
    await db.update(smsRecipients).set({ enabled: false }).where(eq(smsRecipients.id, row.id))
    const [updated] = await db.select().from(smsRecipients).where(eq(smsRecipients.id, row.id))
    expect(updated.enabled).toBe(false)
  })

  afterAll(async () => {
    // All test rows carry an NS-prefixed label; cleanup by label is safe.
    await cleanupByPrefix(smsRecipients, 'label', NS)
  })
})
