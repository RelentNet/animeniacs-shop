import type { ContentEntry } from '@/lib/content'

export function MarkdownPage({ content }: { content: ContentEntry }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:py-20">
      <article
        className="prose enter"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at build time in scripts/content-build.ts
        dangerouslySetInnerHTML={{ __html: content.html }}
      />
    </div>
  )
}
