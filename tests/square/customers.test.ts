import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSearch = vi.fn()
const mockCreate = vi.fn()
const mockGet = vi.fn()
const mockUpdate = vi.fn()
const mockGetSquareClient = vi.fn(() => ({
  customers: {
    search: mockSearch,
    create: mockCreate,
    get: mockGet,
    update: mockUpdate
  }
}))

// Phase 15: the Square↔user mapping is now read/written on the user row via
// these query helpers (was the dropped `customer_link` table).
const mockGetLink = vi.fn()
const mockSetLink = vi.fn()

vi.mock('@/lib/square/client', () => ({ getSquareClient: mockGetSquareClient }))
vi.mock('@/lib/db/queries/user', () => ({
  getUserSquareCustomerId: mockGetLink,
  setUserSquareCustomerId: mockSetLink
}))

beforeEach(() => {
  mockSearch.mockReset()
  mockCreate.mockReset()
  mockGet.mockReset()
  mockUpdate.mockReset()
  mockGetLink.mockReset()
  mockSetLink.mockReset().mockResolvedValue(undefined)
})

describe('findOrCreateSquareCustomer', () => {
  it('cached path: returns the linked squareCustomerId without calling Square', async () => {
    mockGetLink.mockResolvedValue('sq_cached')

    const { findOrCreateSquareCustomer } = await import('@/lib/square/customers')
    const id = await findOrCreateSquareCustomer({
      userId: 'u1',
      email: 'u1@example.com',
      name: 'Ada'
    })

    expect(id).toBe('sq_cached')
    expect(mockSearch).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('search-found path: reuses the customer found by email and persists onto the user', async () => {
    mockGetLink.mockResolvedValue(null)
    mockSearch.mockResolvedValue({ customers: [{ id: 'sq_found' }] })

    const { findOrCreateSquareCustomer } = await import('@/lib/square/customers')
    const id = await findOrCreateSquareCustomer({
      userId: 'u1',
      email: 'u1@example.com',
      name: 'Ada'
    })

    expect(id).toBe('sq_found')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockSetLink).toHaveBeenCalledWith('u1', 'sq_found')
  })

  it('create path: creates a customer with referenceId=userId and persists onto the user', async () => {
    mockGetLink.mockResolvedValue(null)
    mockSearch.mockResolvedValue({ customers: [] })
    mockCreate.mockResolvedValue({ customer: { id: 'sq_new' } })

    const { findOrCreateSquareCustomer } = await import('@/lib/square/customers')
    const id = await findOrCreateSquareCustomer({
      userId: 'u1',
      email: 'u1@example.com',
      name: 'Ada Lovelace'
    })

    expect(id).toBe('sq_new')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'u1', emailAddress: 'u1@example.com' })
    )
    expect(mockSetLink).toHaveBeenCalledWith('u1', 'sq_new')
  })

  it('create path with no email: skips search and creates directly', async () => {
    mockGetLink.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ customer: { id: 'sq_new2' } })

    const { findOrCreateSquareCustomer } = await import('@/lib/square/customers')
    const id = await findOrCreateSquareCustomer({ userId: 'u2', email: null, name: null })

    expect(id).toBe('sq_new2')
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('throws when Square create returns no customer id (caller swallows)', async () => {
    mockGetLink.mockResolvedValue(null)
    mockSearch.mockResolvedValue({ customers: [] })
    mockCreate.mockResolvedValue({ customer: {} })

    const { findOrCreateSquareCustomer } = await import('@/lib/square/customers')
    await expect(
      findOrCreateSquareCustomer({ userId: 'u1', email: 'u1@example.com', name: null })
    ).rejects.toThrow()
  })
})

describe('getSquareCustomer', () => {
  it('returns the customer or null', async () => {
    mockGet.mockResolvedValue({ customer: { id: 'sq_1', emailAddress: 'a@b.com' } })
    const { getSquareCustomer } = await import('@/lib/square/customers')
    const c = await getSquareCustomer('sq_1')
    expect(c?.id).toBe('sq_1')
    expect(mockGet).toHaveBeenCalledWith({ customerId: 'sq_1' })
  })

  it('returns null when the lookup throws', async () => {
    mockGet.mockRejectedValue(new Error('not found'))
    const { getSquareCustomer } = await import('@/lib/square/customers')
    const c = await getSquareCustomer('missing')
    expect(c).toBeNull()
  })
})

describe('updateSquareCustomerAddress', () => {
  it('calls customers.update with the customerId and address', async () => {
    mockUpdate.mockResolvedValue({ customer: { id: 'sq_1' } })
    const { updateSquareCustomerAddress } = await import('@/lib/square/customers')
    await updateSquareCustomerAddress('sq_1', {
      addressLine1: '500 Electric Ave',
      locality: 'New York',
      administrativeDistrictLevel1: 'NY',
      postalCode: '10003',
      country: 'US'
    })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'sq_1',
        address: expect.objectContaining({ addressLine1: '500 Electric Ave', country: 'US' })
      })
    )
  })
})
