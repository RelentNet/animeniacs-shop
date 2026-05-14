import { MarkdownPage } from '@/components/content/MarkdownPage'
import { getContent } from '@/lib/content'
import { notFound } from 'next/navigation'

export const metadata = { title: 'B2B Inquiries | Animeniacs' }

export default function Page() {
  const content = getContent('b2b')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
