import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Mock writeFile before importing the module under test. Keep the rest of
// the real module (other consumers import its default + named exports).
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    default: { ...actual, writeFile: mockWriteFile },
    writeFile: mockWriteFile
  }
})

// sharp cannot process synthetic byte buffers, so stub the resize→webp→toBuffer
// chain. We only assert path/URL logic + validation, not real transcoding.
vi.mock('sharp', () => {
  const chain = {
    resize: vi.fn(() => chain),
    webp: vi.fn(() => chain),
    toBuffer: vi.fn(async () => Buffer.from([1, 2, 3]))
  }
  return { default: vi.fn(() => chain) }
})

const { saveReviewPhoto, AvatarValidationError } = await import('@/lib/images/upload')

function makeFile(name: string, type: string, sizeBytes: number): File {
  const buf = new Uint8Array(sizeBytes).fill(1)
  return {
    name,
    type,
    size: sizeBytes,
    arrayBuffer: async () => buf.buffer
  } as unknown as File
}

describe('saveReviewPhoto', () => {
  it('returns a URL under /images/uploads/review-photos/', async () => {
    const file = makeFile('photo.webp', 'image/webp', 100)
    const url = await saveReviewPhoto(file, 'rev-0')
    expect(url).toBe('/images/uploads/review-photos/rev-0.webp')
  })

  it('calls writeFile at the uploads/review-photos path', async () => {
    const file = makeFile('photo.png', 'image/png', 100)
    await saveReviewPhoto(file, 'rev-0')
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(
        `public${path.sep}images${path.sep}uploads${path.sep}review-photos${path.sep}rev-0.webp`
      ),
      expect.any(Buffer)
    )
  })

  it('throws AvatarValidationError for an empty file', async () => {
    const file = makeFile('empty.png', 'image/png', 0)
    await expect(saveReviewPhoto(file, 'rev-0')).rejects.toBeInstanceOf(AvatarValidationError)
  })

  it('throws AvatarValidationError for an oversized file', async () => {
    const file = makeFile('big.png', 'image/png', 3 * 1024 * 1024)
    await expect(saveReviewPhoto(file, 'rev-0')).rejects.toBeInstanceOf(AvatarValidationError)
  })

  it('throws AvatarValidationError for an unsupported MIME type', async () => {
    const file = makeFile('bad.gif', 'image/gif', 100)
    await expect(saveReviewPhoto(file, 'rev-0')).rejects.toBeInstanceOf(AvatarValidationError)
  })

  it('surfaces EACCES from writeFile as AvatarValidationError', async () => {
    mockWriteFile.mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' })
    )
    const file = makeFile('ok.webp', 'image/webp', 100)
    await expect(saveReviewPhoto(file, 'rev-0')).rejects.toBeInstanceOf(AvatarValidationError)
  })
})
