import type { ContentEntry } from '@/lib/content'
import DOMPurify from 'isomorphic-dompurify'

export function MarkdownPage({ content }: { content: ContentEntry }) {
  const safeHtml = DOMPurify.sanitize(content.html)
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <div
        className="prose"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify above
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </article>
  )
}
