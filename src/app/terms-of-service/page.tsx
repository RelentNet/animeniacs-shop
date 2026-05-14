import { MarkdownPage } from '@/components/content/MarkdownPage'
import { getContent } from '@/lib/content'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Terms of Service | Animeniacs' }

export default function Page() {
  const content = getContent('terms-of-service')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
