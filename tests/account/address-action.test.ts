import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockFindOrCreate = vi.fn()
const mockUpdateAddress = vi.fn()
const mockRevalidatePath = vi.fn()

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/square/customers', () => ({
  findOrCreateSquareCustomer: mockFindOrCreate,
  updateSquareCustomerAddress: mockUpdateAddress,
  getSquareCustomer: vi.fn()
}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({
    isAuthenticated: true,
    userId: 'u1',
    email: 'ada@example.com',
    name: 'Ada',
    roles: []
  })
  mockFindOrCreate.mockReset().mockResolvedValue('sq_cust_1')
  mockUpdateAddress.mockReset().mockResolvedValue(undefined)
  mockRevalidatePath.mockReset()
})

function makeForm(over: Record<string, string> = {}) {
  const form = new FormData()
  form.set('addressLine1', '500 Electric Ave')
  form.set('addressLine2', 'Suite 600')
  form.set('locality', 'New York')
  form.set('administrativeDistrictLevel1', 'NY')
  form.set('postalCode', '10003')
  form.set('country', 'US')
  for (const [k, v] of Object.entries(over)) form.set(k, v)
  return form
}

describe('saveAddressAction', () => {
  it('finds-or-creates the customer and updates the Square address', async () => {
    const { saveAddressAction } = await import('@/app/(account)/account/_components/actions')
    const result = await saveAddressAction({}, makeForm())

    expect(mockFindOrCreate).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'ada@example.com',
      name: 'Ada'
    })
    expect(mockUpdateAddress).toHaveBeenCalledWith(
      'sq_cust_1',
      expect.objectContaining({
        addressLine1: '500 Electric Ave',
        addressLine2: 'Suite 600',
        locality: 'New York',
        administrativeDistrictLevel1: 'NY',
        postalCode: '10003',
        country: 'US'
      })
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/account')
    expect(result).toEqual({ saved: true })
  })

  it('returns an error when required fields are missing', async () => {
    const { saveAddressAction } = await import('@/app/(account)/account/_components/actions')
    const result = await saveAddressAction({}, makeForm({ addressLine1: '' }))

    expect(result.saved).not.toBe(true)
    expect(result.error).toBeTruthy()
    expect(mockUpdateAddress).not.toHaveBeenCalled()
  })

  it('returns an error when the user is not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })
    const { saveAddressAction } = await import('@/app/(account)/account/_components/actions')
    const result = await saveAddressAction({}, makeForm())

    expect(result.saved).not.toBe(true)
    expect(mockFindOrCreate).not.toHaveBeenCalled()
  })
})
