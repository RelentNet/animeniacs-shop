import 'server-only'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

/**
 * Server-side avatar handling for the admin artist form.
 *
 * Pipeline:
 *   1. Validate MIME + byte-size (defense in depth on top of HTML
 *      `accept` attribute — clients lie).
 *   2. Resize to a square 500x500 webp via `sharp` (centered cover
 *      crop). webp is the smallest common-denominator format that
 *      supports both lossy and transparency.
 *   3. Write to public/images/artists/<slug>.webp.
 *   4. Return the public URL path so the caller can store it on the
 *      `artists.avatar_url` column.
 *
 * Deploy target is Coolify, which preserves writes under public/ at
 * runtime (per locked Decision #3). On a hypothetical migration to
 * Vercel/serverless, swap the implementation of `saveAvatar` to a
 * Blob/S3 client — the call site signature stays identical.
 */

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const AVATAR_DIR_REL = 'public/images/artists'
const AVATAR_OUTPUT_SIZE = 500

export interface AvatarUploadError {
  field: 'avatarFile'
  message: string
}

export class AvatarValidationError extends Error {
  readonly field = 'avatarFile' as const
  constructor(message: string) {
    super(message)
    this.name = 'AvatarValidationError'
  }
}

/**
 * Validate the file, resize to 500x500 webp, write to disk, return
 * the public URL.
 *
 * Throws `AvatarValidationError` for any user-input problem (size,
 * MIME, empty file). Lets unexpected errors (disk I/O, sharp
 * crashes) propagate — those are server bugs, not user errors.
 */
export async function saveAvatar(file: File, slug: string): Promise<string> {
  if (file.size === 0) {
    throw new AvatarValidationError('Avatar file is empty.')
  }
  if (file.size > MAX_BYTES) {
    throw new AvatarValidationError(
      `Avatar file is ${(file.size / 1024 / 1024).toFixed(1)} MB; limit is 2 MB.`
    )
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new AvatarValidationError(
      `Unsupported file type "${file.type}". Allowed: PNG, JPEG, WebP.`
    )
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer())

  const outputBuffer = await sharp(inputBuffer)
    .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88 })
    .toBuffer()

  const filename = `${slug}.webp`
  const absolutePath = path.resolve(AVATAR_DIR_REL, filename)
  await writeFile(absolutePath, outputBuffer)

  // Public URL relative to the app root — Next.js serves `public/`
  // contents at the root path.
  return `/images/artists/${filename}`
}
