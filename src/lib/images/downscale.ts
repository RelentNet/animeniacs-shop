import 'server-only'
import sharp from 'sharp'
import { artMaxEdge } from './art-url'

/**
 * Downscale an art image so its LONGEST edge is at most `maxEdge` px (default
 * from `ART_IMAGE_MAX_EDGE`), re-encode as webp, and strip metadata. `fit:
 * 'inside'` + `withoutEnlargement` caps width OR height — protecting portrait
 * and landscape with one number — and never upscales a smaller original. This
 * is the art-protection guarantee: the print-resolution original is never the
 * thing we serve.
 */
export async function downscaleArtImage(
  input: Buffer,
  maxEdge: number = artMaxEdge()
): Promise<Buffer> {
  return sharp(input)
    .rotate() // honor EXIF orientation, then drop metadata (sharp omits it by default)
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}
