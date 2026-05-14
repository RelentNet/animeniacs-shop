import { MarkdownPage } from '@/components/content/MarkdownPage'
import { getContent } from '@/lib/content'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Refund & Return Policy | Animeniacs' }

export default function Page() {
  const content = getContent('refund-return-policy')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
