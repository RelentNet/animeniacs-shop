import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
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
const UPLOADS_DIR_REL = 'public/images/uploads'
const ARTISTS_SUBDIR = 'artists'
const REVIEW_PHOTOS_SUBDIR = 'review-photos'
const AVATAR_OUTPUT_SIZE = 500
const REVIEW_PHOTO_MAX_DIMENSION = 1200

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
 * Validate an uploaded image file: non-empty, within the 2 MB cap, and an
 * allowed MIME type (clients lie, so this is defense in depth on top of the
 * HTML `accept` attribute). Throws `AvatarValidationError` on any problem.
 */
function validateImageFile(file: File): void {
  if (file.size === 0) {
    throw new AvatarValidationError('Image file is empty.')
  }
  if (file.size > MAX_BYTES) {
    throw new AvatarValidationError(
      `Image file is ${(file.size / 1024 / 1024).toFixed(1)} MB; limit is 2 MB.`
    )
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new AvatarValidationError(
      `Unsupported file type "${file.type}". Allowed: PNG, JPEG, WebP.`
    )
  }
}

/**
 * Write a re-encoded webp buffer to `public/images/uploads/<subdir>/<filename>`,
 * backed by the `uploads-data` named Docker volume.
 *
 * Surfaces EACCES/EROFS/ENOENT (volume not mounted / misconfigured) as
 * `AvatarValidationError` so a deployment issue degrades to a friendly form
 * error rather than a 500. Returns the public URL (Next.js serves `public/`
 * at the root path). Lets other unexpected errors propagate (server bugs).
 */
async function writeWebp(buffer: Buffer, subdir: string, filename: string): Promise<string> {
  const absolutePath = path.resolve(UPLOADS_DIR_REL, subdir, filename)
  try {
    // Ensure the target subdir exists before writing. The named uploads volume
    // only gets the image's subdirs seeded on FIRST creation, so a volume
    // created before a given subdir was added (e.g. review-photos/, added in
    // Phase 12) won't contain it → writeFile would ENOENT. Creating it here
    // makes uploads resilient to volume age, recreated volumes, and any future
    // upload subdir (ip-covers/, event-logos/).
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, buffer)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EROFS' || code === 'ENOENT') {
      throw new AvatarValidationError(
        'Upload directory not writable — check that the uploads volume is mounted correctly.'
      )
    }
    throw err
  }
  return `/images/uploads/${subdir}/${filename}`
}

/**
 * Validate the file, resize to a 500x500 cover-cropped webp, write to the
 * uploads volume, return the public URL for `artists.avatar_url`.
 */
export async function saveAvatar(file: File, slug: string): Promise<string> {
  validateImageFile(file)

  const inputBuffer = Buffer.from(await file.arrayBuffer())
  const outputBuffer = await sharp(inputBuffer)
    .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88 })
    .toBuffer()

  return writeWebp(outputBuffer, ARTISTS_SUBDIR, `${slug}.webp`)
}

/**
 * Validate the file, resize to fit within 1200x1200 (preserve aspect ratio,
 * never enlarge), re-encode to webp (strips metadata + neutralizes malicious
 * payloads), write to the uploads volume, return the public URL.
 *
 * `key` is the caller-supplied filename stem, conventionally
 * `<reviewId>-<index>`. Throws `AvatarValidationError` on bad input.
 */
export async function saveReviewPhoto(file: File, key: string): Promise<string> {
  validateImageFile(file)

  const inputBuffer = Buffer.from(await file.arrayBuffer())
  const outputBuffer = await sharp(inputBuffer)
    .resize(REVIEW_PHOTO_MAX_DIMENSION, REVIEW_PHOTO_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 82 })
    .toBuffer()

  return writeWebp(outputBuffer, REVIEW_PHOTOS_SUBDIR, `${key}.webp`)
}
