import { MarkdownPage } from '@/components/content/MarkdownPage'
import { getContent } from '@/lib/content'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Careers | Animeniacs' }

export default function Page() {
  const content = getContent('careers')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
