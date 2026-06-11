import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 15: account address actions now back the saved_addresses table
// (getAddresses/saveAddress/deleteAddress/setDefaultAddress), replacing the
// single-address-on-the-Square-customer flow.
const mockGetCurrentUser = vi.fn()
const mockSaveAddress = vi.fn()
const mockDeleteAddress = vi.fn()
const mockSetDefaultAddress = vi.fn()
const mockRevalidatePath = vi.fn()

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock('@/lib/db/queries/addresses', () => ({
  saveAddress: mockSaveAddress,
  deleteAddress: mockDeleteAddress,
  setDefaultAddress: mockSetDefaultAddress
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
  mockSaveAddress.mockReset().mockResolvedValue({ id: 'a1' })
  mockDeleteAddress.mockReset().mockResolvedValue(undefined)
  mockSetDefaultAddress.mockReset().mockResolvedValue(undefined)
  mockRevalidatePath.mockReset()
})

function makeForm(over: Record<string, string> = {}) {
  const form = new FormData()
  form.set('label', 'Home')
  form.set('firstName', 'Ada')
  form.set('lastName', 'Lovelace')
  form.set('line1', '500 Electric Ave')
  form.set('line2', 'Suite 600')
  form.set('city', 'New York')
  form.set('state', 'NY')
  form.set('zip', '10003')
  for (const [k, v] of Object.entries(over)) form.set(k, v)
  return form
}

describe('addAddressAction', () => {
  it('saves the address (with optional fields + default flag) and revalidates', async () => {
    const form = makeForm()
    form.set('isDefault', 'on')
    const { addAddressAction } = await import('@/app/(account)/account/_components/actions')
    const result = await addAddressAction({}, form)

    expect(mockSaveAddress).toHaveBeenCalledWith('u1', {
      label: 'Home',
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: '500 Electric Ave',
        line2: 'Suite 600',
        city: 'New York',
        state: 'NY',
        zip: '10003'
      },
      isDefault: true
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/account')
    expect(result).toEqual({ saved: true })
  })

  it('returns an error when required fields are missing', async () => {
    const { addAddressAction } = await import('@/app/(account)/account/_components/actions')
    const result = await addAddressAction({}, makeForm({ line1: '' }))

    expect(result.saved).not.toBe(true)
    expect(result.error).toBeTruthy()
    expect(mockSaveAddress).not.toHaveBeenCalled()
  })

  it('returns an error when the user is not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      email: null,
      name: null,
      roles: []
    })
    const { addAddressAction } = await import('@/app/(account)/account/_components/actions')
    const result = await addAddressAction({}, makeForm())

    expect(result.saved).not.toBe(true)
    expect(mockSaveAddress).not.toHaveBeenCalled()
  })
})

describe('deleteAddressAction', () => {
  it('deletes the owner-scoped address and revalidates', async () => {
    const form = new FormData()
    form.set('id', 'a1')
    const { deleteAddressAction } = await import('@/app/(account)/account/_components/actions')
    await deleteAddressAction(form)

    expect(mockDeleteAddress).toHaveBeenCalledWith('u1', 'a1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/account')
  })

  it('does nothing when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({ isAuthenticated: false, userId: null, roles: [] })
    const form = new FormData()
    form.set('id', 'a1')
    const { deleteAddressAction } = await import('@/app/(account)/account/_components/actions')
    await deleteAddressAction(form)

    expect(mockDeleteAddress).not.toHaveBeenCalled()
  })
})

describe('setDefaultAddressAction', () => {
  it('marks the address default and revalidates', async () => {
    const form = new FormData()
    form.set('id', 'a2')
    const { setDefaultAddressAction } = await import('@/app/(account)/account/_components/actions')
    await setDefaultAddressAction(form)

    expect(mockSetDefaultAddress).toHaveBeenCalledWith('u1', 'a2')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/account')
  })
})
