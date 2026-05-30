import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn()
}))

const mockRevalidate = vi.fn()
const mockRedirect = vi.fn(() => {
  throw new Error('NEXT_REDIRECT')
})

vi.mock('@/lib/db/queries/sms-recipients', async (importOriginal) => {
  // Pull SmsRecipientInputSchema (and any other named exports) from the real
  // module so validation still runs against the real Zod schema. Only the DB
  // mutators are swapped out for spies.
  const mod: typeof import('@/lib/db/queries/sms-recipients') = await importOriginal()
  return {
    ...mod,
    createSmsRecipient: mockCreate,
    updateSmsRecipient: mockUpdate,
    deleteSmsRecipient: mockDelete
  }
})
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

function makeForm(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

afterEach(() => {
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockDelete.mockReset()
  mockRevalidate.mockReset()
  mockRedirect.mockClear()
})

describe('createSmsRecipientAction', () => {
  it('happy path: validates, creates, revalidates, redirects', async () => {
    mockCreate.mockResolvedValueOnce({
      id: 1,
      phone: '+14155552671',
      label: 'Owner',
      enabled: true
    })
    const { createSmsRecipientAction } = await import(
      '@/app/(admin)/admin/sms-recipients/new/actions'
    )
    const form = makeForm({
      phone: '+14155552671',
      label: 'Owner',
      enabled: 'true'
    })
    await expect(createSmsRecipientAction(undefined, form)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+14155552671', label: 'Owner', enabled: true })
    )
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/sms-recipients')
    expect(mockRedirect).toHaveBeenCalledWith('/admin/sms-recipients')
  })

  it('rejects invalid phone without hitting DB', async () => {
    const { createSmsRecipientAction } = await import(
      '@/app/(admin)/admin/sms-recipients/new/actions'
    )
    const form = makeForm({
      phone: 'not-a-number',
      label: 'Owner',
      enabled: 'true'
    })
    const result = await createSmsRecipientAction(undefined, form)
    expect(result?.error?.fields?.phone).toBeDefined()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('translates unique phone violation to friendly field error', async () => {
    mockCreate.mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint "sms_recipients_phone_unique"'
    })
    const { createSmsRecipientAction } = await import(
      '@/app/(admin)/admin/sms-recipients/new/actions'
    )
    const form = makeForm({
      phone: '+14155552671',
      label: 'Owner',
      enabled: 'true'
    })
    const result = await createSmsRecipientAction(undefined, form)
    expect(result?.error?.fields?.phone).toMatch(/already used/i)
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe('updateSmsRecipientAction', () => {
  it('happy path: validates, updates, redirects', async () => {
    mockUpdate.mockResolvedValueOnce({
      id: 7,
      phone: '+14155552671',
      label: 'Manager',
      enabled: false
    })
    const { updateSmsRecipientAction } = await import(
      '@/app/(admin)/admin/sms-recipients/[id]/actions'
    )
    const form = makeForm({
      phone: '+14155552671',
      label: 'Manager',
      enabled: 'false'
    })
    await expect(updateSmsRecipientAction(7, undefined, form)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ phone: '+14155552671', label: 'Manager', enabled: false })
    )
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/sms-recipients')
    expect(mockRedirect).toHaveBeenCalledWith('/admin/sms-recipients')
  })

  it('throws when id is NaN (action contract: numeric id required)', async () => {
    // The page-level boundary guards against NaN before calling the action,
    // but if a caller supplies NaN, drizzle/pg will reject it. We simulate by
    // having the update mock throw, and assert the action surfaces the throw
    // rather than swallowing it as a unique-violation.
    mockUpdate.mockRejectedValueOnce(new Error('invalid input syntax for type integer: "NaN"'))
    const { updateSmsRecipientAction } = await import(
      '@/app/(admin)/admin/sms-recipients/[id]/actions'
    )
    const form = makeForm({
      phone: '+14155552671',
      label: 'Manager',
      enabled: 'true'
    })
    await expect(updateSmsRecipientAction(Number.NaN, undefined, form)).rejects.toThrow(
      /invalid input syntax/
    )
  })
})

describe('deleteSmsRecipientAction', () => {
  it('happy path: calls deleteSmsRecipient, revalidates, redirects', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    const { deleteSmsRecipientAction } = await import(
      '@/app/(admin)/admin/sms-recipients/[id]/actions'
    )
    await expect(deleteSmsRecipientAction(42)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockDelete).toHaveBeenCalledWith(42)
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/sms-recipients')
    expect(mockRedirect).toHaveBeenCalledWith('/admin/sms-recipients')
  })
})
