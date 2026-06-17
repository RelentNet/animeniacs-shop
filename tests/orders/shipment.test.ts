import { parseShipment } from '@/lib/orders/shipment'
import { describe, expect, it } from 'vitest'

describe('parseShipment', () => {
  it('extracts recipient, address lines, carrier, tracking, and shippedAt from a SHIPMENT fulfillment', () => {
    const raw = {
      state: 'COMPLETED',
      fulfillments: [
        {
          type: 'SHIPMENT',
          state: 'COMPLETED',
          shipmentDetails: {
            recipient: {
              displayName: 'Ada Lovelace',
              emailAddress: 'ada@example.com',
              phoneNumber: '+15551234567',
              address: {
                addressLine1: '123 Main St',
                addressLine2: 'Apt 4',
                locality: 'Springfield',
                administrativeDistrictLevel1: 'IL',
                postalCode: '62704',
                country: 'US'
              }
            },
            carrier: 'USPS',
            shippingType: 'Ground',
            trackingNumber: '9400111899223197428490',
            trackingUrl:
              'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490',
            shippedAt: '2026-06-12T18:30:00Z'
          }
        }
      ]
    }
    const ship = parseShipment(raw)
    expect(ship).not.toBeNull()
    expect(ship?.recipientName).toBe('Ada Lovelace')
    expect(ship?.carrier).toBe('USPS')
    expect(ship?.shippingType).toBe('Ground')
    expect(ship?.trackingNumber).toBe('9400111899223197428490')
    expect(ship?.trackingUrl).toBe(
      'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490'
    )
    expect(ship?.shippedAt).toBe('2026-06-12T18:30:00Z')
    // Address rendered as ordered display lines, omitting empty parts.
    expect(ship?.addressLines).toEqual(['123 Main St', 'Apt 4', 'Springfield, IL 62704', 'US'])
  })

  it('returns null when there is no SHIPMENT fulfillment (e.g. a DIGITAL order)', () => {
    const raw = {
      fulfillments: [{ type: 'DIGITAL', state: 'COMPLETED', digitalDetails: {} }]
    }
    expect(parseShipment(raw)).toBeNull()
  })

  it('returns null when there are no fulfillments at all', () => {
    expect(parseShipment({ state: 'OPEN' })).toBeNull()
    expect(parseShipment({ fulfillments: [] })).toBeNull()
    expect(parseShipment(null)).toBeNull()
    expect(parseShipment(undefined)).toBeNull()
  })

  it('ignores a SHIPMENT fulfillment that carries no shipmentDetails', () => {
    const raw = { fulfillments: [{ type: 'SHIPMENT', state: 'PROPOSED' }] }
    expect(parseShipment(raw)).toBeNull()
  })

  it('picks the first SHIPMENT fulfillment with details, skipping a non-SHIPMENT before it', () => {
    const raw = {
      fulfillments: [
        { type: 'DIGITAL', state: 'COMPLETED' },
        { type: 'SHIPMENT', shipmentDetails: { recipient: { displayName: 'B' }, carrier: 'UPS' } }
      ]
    }
    const ship = parseShipment(raw)
    expect(ship?.recipientName).toBe('B')
    expect(ship?.carrier).toBe('UPS')
  })

  it('tolerates partial details (no address, no tracking) and yields nulls / empty lines', () => {
    const raw = {
      fulfillments: [
        { type: 'SHIPMENT', shipmentDetails: { recipient: { displayName: 'Solo Name' } } }
      ]
    }
    const ship = parseShipment(raw)
    expect(ship?.recipientName).toBe('Solo Name')
    expect(ship?.addressLines).toEqual([])
    expect(ship?.carrier).toBeNull()
    expect(ship?.trackingNumber).toBeNull()
    expect(ship?.trackingUrl).toBeNull()
    expect(ship?.shippedAt).toBeNull()
  })

  it('builds the locality line from whatever city/state/zip parts are present', () => {
    const raw = {
      fulfillments: [
        {
          type: 'SHIPMENT',
          shipmentDetails: {
            recipient: { address: { locality: 'Portland', administrativeDistrictLevel1: 'OR' } }
          }
        }
      ]
    }
    expect(parseShipment(raw)?.addressLines).toEqual(['Portland, OR'])
  })
})
