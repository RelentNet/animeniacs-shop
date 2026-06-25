import { describe, expect, it } from 'vitest'
import { packCart } from '@/lib/shipping/parcels'

const keys = (acrylics: number, frames: number) =>
  packCart({ acrylics, frames }).map((p) => p.key)

describe('shipping/parcels packCart', () => {
  it('empty cart → no parcels', () => {
    expect(keys(0, 0)).toEqual([])
  })

  it('one acrylic → one single_acrylic box', () => {
    expect(keys(1, 0)).toEqual(['single_acrylic'])
  })

  it('each loose acrylic gets its own box', () => {
    expect(keys(5, 0)).toEqual(Array(5).fill('single_acrylic'))
  })

  it('three frames → one 3_frames box', () => {
    expect(keys(0, 3)).toEqual(['3_frames'])
  })

  it('four frames → 3_frames + frame', () => {
    expect(keys(0, 4)).toEqual(['3_frames', 'frame'])
  })

  it('a frame box absorbs up to 2 acrylics', () => {
    expect(keys(2, 1)).toEqual(['frame'])
  })

  it('frame absorbs 2 acrylics, the rest go loose', () => {
    expect(keys(3, 1)).toEqual(['frame', 'single_acrylic'])
  })

  it('two frames each absorb 2 acrylics (no leftover boxes)', () => {
    expect(keys(4, 2)).toEqual(['frame', 'frame'])
  })

  it('3_frames boxes do NOT absorb acrylics — only Frame boxes do', () => {
    // 6 frames → two 3_frames boxes (which carry no acrylics); 6 acrylics go loose.
    expect(keys(6, 6)).toEqual([
      '3_frames',
      '3_frames',
      ...Array(6).fill('single_acrylic')
    ])
  })

  it('never under-packs: total boxes cover every unit', () => {
    const parcels = packCart({ acrylics: 7, frames: 5 })
    // 5 frames → one 3_frames + two frame boxes (absorb 4 acrylics); 3 acrylics loose.
    expect(parcels).toHaveLength(1 + 2 + 3)
  })
})
