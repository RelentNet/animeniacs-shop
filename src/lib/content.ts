import manifest from '@/lib/generated/content-manifest.json'

export type ContentEntry = {
  slug: string
  title: string
  html: string
}

const typed = manifest as Record<string, ContentEntry>

export function getContent(slug: string): ContentEntry | null {
  return typed[slug] ?? null
}

export function listContent(): ContentEntry[] {
  return Object.values(typed)
}
