import { downscaleArtImage } from '@/lib/images/downscale'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

/** A solid-color raster of the given dimensions, as a PNG buffer. */
async function raster(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } } })
    .png()
    .toBuffer()
}

describe('downscaleArtImage (the art-protection guarantee)', () => {
  it('caps the longest edge of a LANDSCAPE original and outputs webp', async () => {
    const out = await downscaleArtImage(await raster(4000, 2500), 2048)
    const m = await sharp(out).metadata()
    expect(m.format).toBe('webp')
    expect(Math.max(m.width ?? 0, m.height ?? 0)).toBeLessThanOrEqual(2048)
    expect(m.width).toBe(2048) // longest edge is the width
  })

  it('caps the longest edge of a PORTRAIT original', async () => {
    const out = await downscaleArtImage(await raster(2500, 4000), 2048)
    const m = await sharp(out).metadata()
    expect(Math.max(m.width ?? 0, m.height ?? 0)).toBeLessThanOrEqual(2048)
    expect(m.height).toBe(2048) // longest edge is the height
  })

  it('honors a lower cap (stronger protection)', async () => {
    const out = await downscaleArtImage(await raster(4000, 4000), 1000)
    const m = await sharp(out).metadata()
    expect(m.width).toBe(1000)
    expect(m.height).toBe(1000)
  })

  it('never upscales a smaller original', async () => {
    const out = await downscaleArtImage(await raster(800, 600), 2048)
    const m = await sharp(out).metadata()
    expect(m.width).toBe(800)
    expect(m.height).toBe(600)
  })
})
