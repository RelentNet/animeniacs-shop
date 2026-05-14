import { MarkdownPage } from '@/components/content/MarkdownPage'
import { getContent } from '@/lib/content'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Become an Artist | Animeniacs' }

export default function Page() {
  const content = getContent('become-an-artist')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
