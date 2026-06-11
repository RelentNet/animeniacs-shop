'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { deleteAddress, saveAddress, setDefaultAddress } from '@/lib/db/queries/addresses'
import type { SavedAddressDetails } from '@/lib/db/schema'
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
 * Adds a new saved address for the signed-in user. Returns a saved/error state
 * for the useFormState-driven add form. When "make default" is checked, the
 * query layer clears any other default in the same transaction.
 */
export async function addAddressAction(
  _prev: AddressFormState,
  form: FormData
): Promise<AddressFormState> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) {
    return { error: 'You must be signed in to save an address.' }
  }

  const label = readField(form, 'label') || 'Shipping address'
  const firstName = readField(form, 'firstName')
  const lastName = readField(form, 'lastName')
  const line1 = readField(form, 'line1')
  const city = readField(form, 'city')
  const state = readField(form, 'state')
  const zip = readField(form, 'zip')

  if (!firstName || !lastName || !line1 || !city || !state || !zip) {
    return { error: 'Please fill in name, street, city, state, and ZIP.' }
  }

  const address: SavedAddressDetails = { firstName, lastName, line1, city, state, zip }
  const line2 = readField(form, 'line2')
  if (line2) address.line2 = line2
  const phone = readField(form, 'phone')
  if (phone) address.phone = phone

  try {
    await saveAddress(user.userId, {
      label,
      address,
      isDefault: form.get('isDefault') === 'on'
    })
  } catch (err) {
    console.error('[account] address save failed:', err)
    return { error: 'Could not save your address. Please try again.' }
  }

  revalidatePath('/account')
  return { saved: true }
}

/** Deletes one of the signed-in user's addresses (owner-scoped in the query). */
export async function deleteAddressAction(form: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) return
  const id = readField(form, 'id')
  if (!id) return
  await deleteAddress(user.userId, id)
  revalidatePath('/account')
}

/** Marks one of the signed-in user's addresses as the default (owner-scoped). */
export async function setDefaultAddressAction(form: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user.isAuthenticated || !user.userId) return
  const id = readField(form, 'id')
  if (!id) return
  await setDefaultAddress(user.userId, id)
  revalidatePath('/account')
}
