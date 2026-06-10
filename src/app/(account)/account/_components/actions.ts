'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  type CustomerAddress,
  findOrCreateSquareCustomer,
  updateSquareCustomerAddress
} from '@/lib/square/customers'
import { revalidatePath } from 'next/cache'

export interface AddressFormState {
  saved?: boolean
  error?: string
}

function readField(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Saves the buyer's shipping address onto their Square Customer. Find-or-creates
 * the customer first (a buyer who never checked out has no mapping yet). Returns
 * a saved/error state for the useFormState-driven AddressForm.
 */
export async function saveAddressAction(
  _prev: AddressFormState,
  form: FormData
): Promise<AddressFormState> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) {
    return { error: 'You must be signed in to save an address.' }
  }

  const addressLine1 = readField(form, 'addressLine1')
  const locality = readField(form, 'locality')
  const administrativeDistrictLevel1 = readField(form, 'administrativeDistrictLevel1')
  const postalCode = readField(form, 'postalCode')
  const country = readField(form, 'country') || 'US'

  if (!addressLine1 || !locality || !administrativeDistrictLevel1 || !postalCode) {
    return { error: 'Please fill in street, city, state, and postal code.' }
  }

  const address: CustomerAddress = {
    addressLine1,
    locality,
    administrativeDistrictLevel1,
    postalCode,
    country
  }
  const addressLine2 = readField(form, 'addressLine2')
  if (addressLine2) address.addressLine2 = addressLine2

  try {
    const customerId = await findOrCreateSquareCustomer({
      userId: user.userId,
      email: user.email,
      name: user.name
    })
    await updateSquareCustomerAddress(customerId, address)
  } catch (err) {
    console.error('[account] address save failed:', err)
    return { error: 'Could not save your address. Please try again.' }
  }

  revalidatePath('/account')
  return { saved: true }
}
