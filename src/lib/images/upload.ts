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
 *   3. Write to public/images/uploads/artists/<slug>.webp — this path
 *      is backed by the `uploads-data` named Docker volume declared in
 *      compose.yml, mounted at /app/public/images/uploads in the runner
 *      container. Files written here persist across container rebuilds.
 *   4. Return the public URL path so the caller can store it on the
 *      `artists.avatar_url` column.
 *
 * Future upload types (IP cover images, review photos, event logos)
 * use the same volume at sibling subdirectories (ip-covers/, review-photos/,
 * event-logos/) — no new volume per feature needed.
 *
 * Previous behaviour (before Phase 10): wrote to public/images/artists/
 * which is part of the container image and is NOT writable at runtime
 * → EACCES in production. Locked Decision #3 from Phase 4 was incorrect
 * and is superseded by this implementation.
 */

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const AVATAR_DIR_REL = 'public/images/uploads/artists'
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
 * Validate the file, resize to 500x500 webp, write to the uploads
 * volume, return the public URL.
 *
 * Throws `AvatarValidationError` for any user-input problem (size,
 * MIME, empty file) AND for EACCES/EROFS/ENOENT (volume not mounted /
 * misconfigured) so a deployment issue degrades to a form error rather
 * than a 500. Lets other unexpected errors (sharp crashes, etc.)
 * propagate — those are server bugs, not user errors.
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
  try {
    await writeFile(absolutePath, outputBuffer)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EROFS' || code === 'ENOENT') {
      throw new AvatarValidationError(
        'Upload directory not writable — check that the uploads volume is mounted correctly.'
      )
    }
    throw err
  }

  // Public URL relative to the app root — Next.js serves `public/`
  // contents at the root path.
  return `/images/uploads/artists/${filename}`
}
