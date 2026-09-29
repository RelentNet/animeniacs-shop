'use client'

import { useCart } from '@/components/cart/useCart'
import { useCartHydration } from '@/components/cart/useCartHydration'
import { SHIPPABLE_COUNTRY_OPTIONS } from '@/lib/shipping/countries'
import { useMemo, useState } from 'react'

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-line bg-wall-2 px-3 py-2 text-sm text-bone placeholder:text-faint focus:border-neon focus:outline-none'

interface AddressForm {
  firstName: string
  lastName: string
  line1: string
  line2: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
  email: string
}

const EMPTY_ADDRESS: AddressForm = {
  firstName: '',
  lastName: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
  phone: '',
  email: ''
}

interface RateOption {
  rateId: string
  shipmentId: string
  carrier: string
  service: string
  amountCents: number
  estimatedDays: number | null
}

type QuoteResponse =
  | { kind: 'rates'; options: RateOption[] }
  | { kind: 'flat'; amountCents: number; reason: 'decals_only' | 'fallback' }

interface RequestItem {
  catalogItemId: string
  variationId: string
  quantity: number
  expectedUnitPriceCents: number
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function CheckoutFlow(): JSX.Element {
  const { items } = useCart()
  const { products } = useCartHydration()
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS)
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null)
  const [loadingRates, setLoadingRates] = useState(false)
  const [loadingPay, setLoadingPay] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build the priced line items from the hydrated cart (skip stale entries).
  const { requestItems, subtotalCents } = useMemo(() => {
    const reqs: RequestItem[] = []
    let subtotal = 0
    for (const entry of items) {
      const product = products[entry.catalogItemId]
      const variation = product?.variations.find((v) => v.id === entry.variationId)
      if (!variation?.price) continue
      reqs.push({
        catalogItemId: entry.catalogItemId,
        variationId: entry.variationId,
        quantity: entry.quantity,
        expectedUnitPriceCents: variation.price.amount
      })
      subtotal += variation.price.amount * entry.quantity
    }
    return { requestItems: reqs, subtotalCents: subtotal }
  }, [items, products])

  function update(field: keyof AddressForm, value: string): void {
    setAddress((a) => ({ ...a, [field]: value }))
    // The address changed → previously fetched rates no longer apply.
    setQuote(null)
    setSelectedRateId(null)
    setError(null)
  }

  const requiredFilled =
    address.firstName.trim() &&
    address.lastName.trim() &&
    address.line1.trim() &&
    address.city.trim() &&
    address.zip.trim() &&
    address.country.trim()

  async function fetchRates(): Promise<void> {
    if (!requiredFilled || requestItems.length === 0) return
    setLoadingRates(true)
    setError(null)
    setQuote(null)
    setSelectedRateId(null)
    try {
      const res = await fetch('/api/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: requestItems, shippingAddress: address })
      })
      if (res.status === 422) {
        setError('We don’t ship to that country yet. Try US, Canada, UK, or the EU.')
        return
      }
      if (res.status === 409) {
        setError('Some prices changed. Please reopen your cart to review before checking out.')
        return
      }
      if (!res.ok) {
        setError('Could not fetch shipping rates. Please check your address and try again.')
        return
      }
      const data = (await res.json()) as QuoteResponse
      setQuote(data)
      if (data.kind === 'rates' && data.options.length > 0) {
        setSelectedRateId(data.options[0].rateId) // default to the cheapest (sorted)
      }
    } catch {
      setError('Network error fetching rates. Please try again.')
    } finally {
      setLoadingRates(false)
    }
  }

  const shippingCents =
    quote?.kind === 'flat'
      ? quote.amountCents
      : quote?.kind === 'rates'
        ? (quote.options.find((o) => o.rateId === selectedRateId)?.amountCents ?? null)
        : null

  const canPay =
    quote !== null &&
    (quote.kind === 'flat' || (quote.kind === 'rates' && selectedRateId !== null)) &&
    requestItems.length > 0

  async function proceedToPayment(): Promise<void> {
    if (!canPay || loadingPay) return
    setLoadingPay(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: requestItems,
          shippingAddress: address,
          ...(quote?.kind === 'rates' && selectedRateId ? { selectedRateId } : {})
        })
      })
      if (res.status === 422) {
        setError('We don’t ship to that country yet.')
        return
      }
      if (res.status === 409) {
        setError('Some prices changed. Please reopen your cart to review.')
        return
      }
      if (!res.ok) {
        setError('Could not start checkout. Please try again.')
        return
      }
      const json = (await res.json()) as { checkoutUrl?: string }
      if (typeof json.checkoutUrl !== 'string') {
        setError('Unexpected checkout response. Please try again.')
        return
      }
      window.location.href = json.checkoutUrl
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoadingPay(false)
    }
  }

  if (requestItems.length === 0) {
    return (
      <div className="panel mt-8 p-6">
        <p className="text-muted">Your cart is empty.</p>
        <a href="/shop" className="btn-neon mt-4 inline-flex">
          Browse the shop <span aria-hidden="true">→</span>
        </a>
      </div>
    )
  }

  return (
    <div className="mt-8 grid gap-6">
      {/* Address */}
      <section className="panel p-6">
        <p className="eyebrow">Ship to</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" value={address.firstName} onChange={(v) => update('firstName', v)} />
          <Field label="Last name" value={address.lastName} onChange={(v) => update('lastName', v)} />
          <div className="sm:col-span-2">
            <Field label="Address" value={address.line1} onChange={(v) => update('line1', v)} />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Apartment, suite, etc. (optional)"
              value={address.line2}
              onChange={(v) => update('line2', v)}
            />
          </div>
          <Field label="City" value={address.city} onChange={(v) => update('city', v)} />
          <Field label="State / Province" value={address.state} onChange={(v) => update('state', v)} />
          <Field label="ZIP / Postal code" value={address.zip} onChange={(v) => update('zip', v)} />
          <label className="block">
            <span className="field-label">Country</span>
            <select
              className={INPUT_CLASS}
              value={address.country}
              onChange={(e) => update('country', e.target.value)}
            >
              {SHIPPABLE_COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Phone (optional)" value={address.phone} onChange={(v) => update('phone', v)} />
          <Field
            label="Email (for order updates)"
            value={address.email}
            onChange={(v) => update('email', v)}
          />
        </div>

        <button
          type="button"
          onClick={fetchRates}
          disabled={!requiredFilled || loadingRates}
          className="btn-neon mt-4"
        >
          {loadingRates ? 'Getting rates…' : 'Get shipping rates'}
        </button>
      </section>

      {/* Rates */}
      {quote?.kind === 'rates' && (
        <section className="panel p-6">
          <p className="eyebrow">Choose a shipping speed</p>
          <ul className="mt-3 grid gap-2">
            {quote.options.map((o) => (
              <li key={o.rateId}>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line bg-wall-2 p-3 hover:border-neon">
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="rate"
                      value={o.rateId}
                      checked={selectedRateId === o.rateId}
                      onChange={() => setSelectedRateId(o.rateId)}
                    />
                    <span className="text-sm text-bone">
                      {o.carrier} · {o.service}
                      {o.estimatedDays ? (
                        <span className="text-muted"> · ~{o.estimatedDays} day{o.estimatedDays === 1 ? '' : 's'}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="font-medium text-bone">{money(o.amountCents)}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {quote?.kind === 'flat' && (
        <section className="panel p-6">
          <p className="eyebrow">Shipping</p>
          <p className="mt-2 text-sm text-bone">
            Flat shipping: <span className="font-medium">{money(quote.amountCents)}</span>
          </p>
          {quote.reason === 'fallback' && (
            <p className="mt-1 text-xs text-muted">
              Live rates are temporarily unavailable, so a flat rate applies.
            </p>
          )}
        </section>
      )}

      {/* Summary + pay */}
      <section className="panel p-6">
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="text-bone">{money(subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Shipping</dt>
            <dd className="text-bone">{shippingCents === null ? '—' : money(shippingCents)}</dd>
          </div>
          {shippingCents !== null && (
            <div className="mt-1 flex justify-between border-t border-line pt-2">
              <dt className="text-bone">Total</dt>
              <dd className="font-display text-lg text-bone">{money(subtotalCents + shippingCents)}</dd>
            </div>
          )}
        </dl>

        {error && (
          <p role="alert" className="alert-error mt-3">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={proceedToPayment}
          disabled={!canPay || loadingPay}
          className="btn-neon mt-4 w-full justify-center"
        >
          {loadingPay ? 'Starting checkout…' : 'Proceed to payment'}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          You’ll complete payment securely on Square.
        </p>
      </section>
    </div>
  )
}

function Field({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
