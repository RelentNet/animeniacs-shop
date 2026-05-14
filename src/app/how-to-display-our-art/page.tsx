import { MarkdownPage } from '@/components/content/MarkdownPage'
import { getContent } from '@/lib/content'
import { notFound } from 'next/navigation'

export const metadata = { title: 'How to Display Your Art | Animeniacs' }

export default function Page() {
  const content = getContent('how-to-display-our-art')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
