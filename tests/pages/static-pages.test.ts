import fs from 'node:fs'
import path from 'node:path'
import { listContent } from '@/lib/content'
import { describe, expect, it } from 'vitest'

describe('static page routes', () => {
  it('every content entry has a corresponding app/<slug>/page.tsx', () => {
    const entries = listContent()
    const missing: string[] = []
    for (const entry of entries) {
      const filePath = path.resolve('src/app', entry.slug, 'page.tsx')
      if (!fs.existsSync(filePath)) missing.push(entry.slug)
    }
    expect(missing).toEqual([])
  })
})
