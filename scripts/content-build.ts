#!/usr/bin/env tsx
/**
 * Reads markdown files from docs/superpowers/specs/static-content-source/
 * and writes a JSON manifest to src/lib/generated/content-manifest.json.
 * Runs as `prebuild` step (see package.json).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

const SOURCE_DIR = path.resolve('docs/superpowers/specs/static-content-source')
const OUTPUT_DIR = path.resolve('src/lib/generated')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'content-manifest.json')

type ContentEntry = {
  slug: string
  title: string
  html: string
}

async function build(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const files = await fs.readdir(SOURCE_DIR)
  files.sort()
  const manifest: Record<string, ContentEntry> = {}

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const slug = file.replace(/\.md$/, '')
    const raw = await fs.readFile(path.join(SOURCE_DIR, file), 'utf-8')
    const { content, data } = matter(raw)
    const html = await marked.parse(content)
    const safeHtml = DOMPurify.sanitize(html)
    // First H1 in the source becomes the title; fall back to filename.
    const titleMatch = content.match(/^#\s+(.+)$/m)
    const title = (data.title as string) ?? titleMatch?.[1] ?? slug.replace(/-/g, ' ')
    manifest[slug] = { slug, title, html: safeHtml }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2))
  console.log(`Built ${Object.keys(manifest).length} content pages → ${OUTPUT_FILE}`)
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
