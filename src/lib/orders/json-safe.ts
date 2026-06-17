/**
 * Square Money amounts come back as `bigint`. The `raw` snapshot is persisted to
 * a jsonb column, and JSON serialization throws "Do not know how to serialize a
 * BigInt". Deep-convert bigints to numbers (currency amounts are well within
 * Number's safe range) so the snapshot is storable. Null/undefined pass through.
 *
 * Shared by `buildOrder` (recording) and the webhook reconcile path (raw
 * refresh) so the BigInt-safe sanitization can never diverge between the two.
 */
export function toJsonSafe<T>(value: T): T {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)))
}
