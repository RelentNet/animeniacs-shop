// Customer-facing label helpers — the single source of truth for how order
// status + fulfillment state are presented across account and guest views.
// Pure functions (no I/O), usable from both server and client components.

import type { OrderStatus } from '@/lib/db/queries/orders'

const STATUS_LABELS: Record<OrderStatus, string> = {
  completed: 'Completed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded'
}

/** Friendly label for an order's refund-aware status. */
export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status] ?? 'Completed'
}

// Square raw fulfillment states → customer-friendly language. PROPOSED/RESERVED
// are still being worked, so both read as "Processing"; PREPARED is packed but
// not shipped; COMPLETED means it has shipped/been handed off.
const FULFILLMENT_LABELS: Record<string, string> = {
  PROPOSED: 'Processing',
  RESERVED: 'Processing',
  PREPARED: 'Being prepared',
  COMPLETED: 'Shipped',
  CANCELED: 'Canceled',
  FAILED: 'Could not be fulfilled'
}

/**
 * Friendly label for a Square fulfillment state. null (no fulfillment yet) and
 * any unrecognized state both fall back to "Processing" — a safe, non-alarming
 * default for the customer.
 */
export function fulfillmentLabel(state: string | null | undefined): string {
  if (!state) return 'Processing'
  return FULFILLMENT_LABELS[state] ?? 'Processing'
}
