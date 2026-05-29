import { db } from '@/lib/db/client'
import {
  createSmsRecipient,
  deleteSmsRecipient,
  getEnabledRecipients,
  getSmsRecipientById,
  updateSmsRecipient
} from '@/lib/db/queries/sms-recipients'
import { smsRecipients } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
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

const NS_HELPERS = testNamespace('smshelpers')

// Phone numbers can be arbitrary E.164; we prefix the namespace as the
// "country code"-ish part to keep them visually unique without colliding
// with real numbers.
function phone(suffix: string) {
  return `+1${NS_HELPERS.replace(/[^0-9]/g, '').slice(0, 6)}${suffix}`
}

afterAll(async () => {
  await db.delete(smsRecipients).where(sql`${smsRecipients.label} LIKE ${`${NS_HELPERS}%`}`)
})

describe('sms_recipients query helpers', () => {
  it('createSmsRecipient inserts a row', async () => {
    const row = await createSmsRecipient({
      phone: phone('111'),
      label: `${NS_HELPERS}_owner`,
      enabled: true
    })
    expect(row.id).toBeGreaterThan(0)
    expect(row.enabled).toBe(true)
    expect(row.label).toBe(`${NS_HELPERS}_owner`)
  })

  it('createSmsRecipient defaults enabled=true', async () => {
    const row = await createSmsRecipient({ phone: phone('222'), label: `${NS_HELPERS}_default` })
    expect(row.enabled).toBe(true)
  })

  it('createSmsRecipient rejects malformed phone via Zod', async () => {
    await expect(
      createSmsRecipient({ phone: 'not-a-number', label: `${NS_HELPERS}_bad` })
    ).rejects.toThrow()
  })

  it('rejects duplicate phone (unique constraint)', async () => {
    await createSmsRecipient({ phone: phone('333'), label: `${NS_HELPERS}_dup1` })
    await expect(
      createSmsRecipient({ phone: phone('333'), label: `${NS_HELPERS}_dup2` })
    ).rejects.toThrow()
  })

  it('getSmsRecipientById returns the row', async () => {
    const created = await createSmsRecipient({ phone: phone('444'), label: `${NS_HELPERS}_byid` })
    const found = await getSmsRecipientById(created.id)
    expect(found?.id).toBe(created.id)
  })

  it('getEnabledRecipients excludes disabled rows', async () => {
    await createSmsRecipient({ phone: phone('555'), label: `${NS_HELPERS}_enabled`, enabled: true })
    await createSmsRecipient({
      phone: phone('666'),
      label: `${NS_HELPERS}_disabled`,
      enabled: false
    })
    const enabled = await getEnabledRecipients()
    const mine = enabled.filter((r) => r.label?.startsWith(NS_HELPERS))
    expect(mine.find((r) => r.label === `${NS_HELPERS}_enabled`)).toBeDefined()
    expect(mine.find((r) => r.label === `${NS_HELPERS}_disabled`)).toBeUndefined()
  })

  it('updateSmsRecipient toggles enabled', async () => {
    const created = await createSmsRecipient({
      phone: phone('777'),
      label: `${NS_HELPERS}_toggle`,
      enabled: true
    })
    await updateSmsRecipient(created.id, { enabled: false })
    const after = await getSmsRecipientById(created.id)
    expect(after?.enabled).toBe(false)
  })

  it('deleteSmsRecipient removes the row', async () => {
    const created = await createSmsRecipient({ phone: phone('888'), label: `${NS_HELPERS}_delete` })
    await deleteSmsRecipient(created.id)
    expect(await getSmsRecipientById(created.id)).toBeUndefined()
  })
})
