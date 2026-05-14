import type { ContentEntry } from '@/lib/content'

export function MarkdownPage({ content }: { content: ContentEntry }) {
  return (
    <div
      className="prose mx-auto max-w-3xl px-4 py-12"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at build time in scripts/content-build.ts
      dangerouslySetInnerHTML={{ __html: content.html }}
    />
  )
}
