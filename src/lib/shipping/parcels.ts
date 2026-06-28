/**
 * Parcel definitions + the cart→boxes packing heuristic for Shippo rating.
 *
 * The operator maintains three physical box setups (specs mirror the live Shippo
 * user-parcel-templates, but we pass explicit dims/weight rather than template
 * ids so the logic is stable across the test vs. live Shippo accounts):
 *   - `single acrylic` — one acrylic print
 *   - `Frame`          — one Lit Box frame + up to 2 acrylics
 *   - `3 Frames`       — three Lit Box frames
 *
 * Pure module (no I/O). Decals / stickers / posters / misc are NOT boxed here —
 * they're handled by the flat decal fee in the quote layer.
 */

export interface Parcel {
  /** Stable key for tests/logging. */
  key: 'single_acrylic' | 'frame' | '3_frames'
  /** Box dimensions in inches. */
  lengthIn: number
  widthIn: number
  heightIn: number
  /** Representative gross weight (box + typical contents) in pounds. */
  weightLb: number
}

export const BOX_SINGLE_ACRYLIC: Parcel = {
  key: 'single_acrylic',
  lengthIn: 22,
  widthIn: 20,
  heightIn: 2,
  weightLb: 3
}

export const BOX_FRAME: Parcel = {
  key: 'frame',
  lengthIn: 30,
  widthIn: 20,
  heightIn: 2.5,
  weightLb: 5
}

export const BOX_3_FRAMES: Parcel = {
  key: '3_frames',
  lengthIn: 30,
  widthIn: 20,
  heightIn: 7.5,
  weightLb: 10
}

/** How many acrylics a single `Frame` box can carry alongside its frame. */
const ACRYLICS_PER_FRAME_BOX = 2

export interface PackInput {
  /** Number of acrylic print units (sum of quantities of acrylic lines). */
  acrylics: number
  /** Number of Lit Box frame units. */
  frames: number
}

/**
 * Greedy packer for acrylics + frames into the three box types. It is a
 * documented heuristic, NOT a globally cost-optimal bin-pack, but it never
 * UNDER-packs (every unit gets a box), which is what matters for not
 * undercharging shipping:
 *
 *   1. Frames fill `3 Frames` boxes three-at-a-time.
 *   2. Each remaining frame takes a `Frame` box, absorbing up to 2 acrylics.
 *   3. Any leftover acrylics each take a `single acrylic` box.
 *
 * Returns the parcel list for one Shippo shipment (multi-parcel → combined
 * rates). Empty array means nothing box-rateable (e.g. a decals-only cart).
 */
export function packCart({ acrylics, frames }: PackInput): Parcel[] {
  let a = Math.max(0, Math.floor(acrylics))
  let f = Math.max(0, Math.floor(frames))
  const parcels: Parcel[] = []

  while (f >= 3) {
    parcels.push(BOX_3_FRAMES)
    f -= 3
  }
  while (f >= 1) {
    parcels.push(BOX_FRAME)
    f -= 1
    const absorbed = Math.min(ACRYLICS_PER_FRAME_BOX, a)
    a -= absorbed
  }
  while (a >= 1) {
    parcels.push(BOX_SINGLE_ACRYLIC)
    a -= 1
  }

  return parcels
}
