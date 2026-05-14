import { MarkdownPage } from '@/components/content/MarkdownPage'
import { getContent } from '@/lib/content'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Privacy Policy | Animeniacs' }

export default function Page() {
  const content = getContent('privacy-policy')
  if (!content) notFound()
  return <MarkdownPage content={content} />
}
