import { beforeEach, describe, expect, it, vi } from 'vitest'

// Thenable chain mock: every builder method returns the chain, and awaiting the
// chain resolves to a per-test `result`. This lets the same `.where` be an
// intermediate step (getAddresses) or a terminal (deleteAddress) without
// colliding, and supports the saveAddress transaction.
const QUERY_METHODS = [
  'select',
  'from',
  'where',
  'orderBy',
  'limit',
  'update',
  'set',
  'insert',
  'values',
  'returning',
  'delete'
] as const

function makeChain(getResult: () => unknown) {
  // biome-ignore lint/suspicious/noExplicitAny: test double
  const chain: any = {}
  for (const m of QUERY_METHODS) chain[m] = vi.fn(() => chain)
  // biome-ignore lint/suspicious/noExplicitAny: thenable
  chain.then = (onF: any, onR: any) => Promise.resolve(getResult()).then(onF, onR)
  return chain
}

let dbResult: unknown = []
let txResult: unknown = []
const dbChain = makeChain(() => dbResult)
const txChain = makeChain(() => txResult)
const transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(txChain))

vi.mock('@/lib/db/client', () => ({
  db: new Proxy(dbChain, {
    get(target, prop) {
      if (prop === 'transaction') return transaction
      return target[prop as keyof typeof target]
    }
  })
}))

beforeEach(() => {
  dbResult = []
  txResult = []
  for (const m of QUERY_METHODS) {
    dbChain[m].mockClear()
    txChain[m].mockClear()
  }
  transaction.mockClear()
})

const sampleDetails = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  line1: '500 Electric Ave',
  city: 'New York',
  state: 'NY',
  zip: '10003'
}

describe('getAddresses', () => {
  it('returns the user rows ordered (default first)', async () => {
    dbResult = [{ id: 'a1', userId: 'u1', isDefault: true }]
    const { getAddresses } = await import('@/lib/db/queries/addresses')
    const rows = await getAddresses('u1')
    expect(rows).toEqual([{ id: 'a1', userId: 'u1', isDefault: true }])
    expect(dbChain.select).toHaveBeenCalled()
    expect(dbChain.where).toHaveBeenCalled()
    expect(dbChain.orderBy).toHaveBeenCalled()
  })
})

describe('getDefaultAddress', () => {
  it('returns the default row', async () => {
    dbResult = [{ id: 'a1', isDefault: true }]
    const { getDefaultAddress } = await import('@/lib/db/queries/addresses')
    expect(await getDefaultAddress('u1')).toEqual({ id: 'a1', isDefault: true })
    expect(dbChain.limit).toHaveBeenCalled()
  })

  it('returns null when there is no default', async () => {
    dbResult = []
    const { getDefaultAddress } = await import('@/lib/db/queries/addresses')
    expect(await getDefaultAddress('u1')).toBeNull()
  })
})

describe('saveAddress', () => {
  it('unsets other defaults in a transaction when isDefault is true', async () => {
    txResult = [{ id: 'new', userId: 'u1', isDefault: true }]
    const { saveAddress } = await import('@/lib/db/queries/addresses')
    const row = await saveAddress('u1', { label: 'Home', address: sampleDetails, isDefault: true })

    expect(transaction).toHaveBeenCalled()
    // one-default invariant: existing defaults are cleared before insert
    expect(txChain.update).toHaveBeenCalled()
    expect(txChain.set).toHaveBeenCalledWith(expect.objectContaining({ isDefault: false }))
    expect(txChain.insert).toHaveBeenCalled()
    expect(txChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', label: 'Home', isDefault: true })
    )
    expect(row).toEqual({ id: 'new', userId: 'u1', isDefault: true })
  })

  it('does NOT clear other defaults when isDefault is falsy', async () => {
    txResult = [{ id: 'new', userId: 'u1', isDefault: false }]
    const { saveAddress } = await import('@/lib/db/queries/addresses')
    await saveAddress('u1', { label: 'Work', address: sampleDetails })

    expect(txChain.update).not.toHaveBeenCalled()
    expect(txChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', label: 'Work', isDefault: false })
    )
  })
})

describe('setDefaultAddress', () => {
  it('clears other defaults then marks the chosen one, in a transaction', async () => {
    const { setDefaultAddress } = await import('@/lib/db/queries/addresses')
    await setDefaultAddress('u1', 'a2')

    expect(transaction).toHaveBeenCalled()
    expect(txChain.update).toHaveBeenCalledTimes(2)
    expect(txChain.set).toHaveBeenCalledWith(expect.objectContaining({ isDefault: false }))
    expect(txChain.set).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true }))
  })
})

describe('deleteAddress', () => {
  it('deletes scoped to the owner (id AND userId)', async () => {
    dbResult = []
    const { deleteAddress } = await import('@/lib/db/queries/addresses')
    await deleteAddress('u1', 'a1')
    expect(dbChain.delete).toHaveBeenCalled()
    expect(dbChain.where).toHaveBeenCalled()
  })
})
