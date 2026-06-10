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

// sharp cannot process the synthetic byte buffers these tests use, so stub
// the resize→webp→toBuffer chain. We only assert on path/URL logic and the
// EACCES handling, not on real image transcoding.
vi.mock('sharp', () => {
  const chain = {
    resize: vi.fn(() => chain),
    webp: vi.fn(() => chain),
    toBuffer: vi.fn(async () => Buffer.from([1, 2, 3]))
  }
  return { default: vi.fn(() => chain) }
})

// Re-import after mock (hoisted pattern not needed here since we use vi.mock at module level)
const { saveAvatar, AvatarValidationError } = await import('@/lib/images/upload')

function makeFile(name: string, type: string, sizeBytes: number): File {
  const buf = new Uint8Array(sizeBytes).fill(1)
  // Minimal stub: saveAvatar only reads .size, .type, .arrayBuffer(). The
  // environment's File does not implement arrayBuffer(), so stub it.
  return {
    name,
    type,
    size: sizeBytes,
    arrayBuffer: async () => buf.buffer
  } as unknown as File
}

describe('saveAvatar', () => {
  it('returns a URL under /images/uploads/artists/', async () => {
    const file = makeFile('test.webp', 'image/webp', 100)
    const url = await saveAvatar(file, 'test-artist')
    expect(url).toBe('/images/uploads/artists/test-artist.webp')
  })

  it('calls writeFile at the uploads/artists path', async () => {
    const file = makeFile('test.png', 'image/png', 100)
    await saveAvatar(file, 'slug-x')
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(`public${path.sep}images${path.sep}uploads${path.sep}artists${path.sep}slug-x.webp`),
      expect.any(Buffer)
    )
  })

  it('throws AvatarValidationError for empty file', async () => {
    const file = makeFile('empty.png', 'image/png', 0)
    await expect(saveAvatar(file, 'slug')).rejects.toBeInstanceOf(AvatarValidationError)
  })

  it('throws AvatarValidationError on EACCES from writeFile', async () => {
    mockWriteFile.mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' })
    )
    const file = makeFile('ok.webp', 'image/webp', 100)
    await expect(saveAvatar(file, 'slug')).rejects.toBeInstanceOf(AvatarValidationError)
  })
})
