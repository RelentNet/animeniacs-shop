import { SmsRecipientForm } from '@/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm'
import { getSmsRecipientById } from '@/lib/db/queries/sms-recipients'
import { notFound } from 'next/navigation'
import { updateSmsRecipientAction } from './actions'

export const metadata = { title: 'Edit SMS recipient — admin' }

interface PageProps {
  params: { id: string }
}

export default async function EditSmsRecipientPage({ params }: PageProps): Promise<JSX.Element> {
  const id = Number.parseInt(params.id, 10)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const recipient = await getSmsRecipientById(id)
  if (!recipient) notFound()

  const boundAction = updateSmsRecipientAction.bind(null, recipient.id)

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Edit SMS recipient: {recipient.label ?? recipient.phone}</h1>
      <p>
        Phone is read-only (delete + re-add if it needs to change). Toggle status to pause
        notifications without losing the row.
      </p>
      <SmsRecipientForm action={boundAction} initial={recipient} mode="edit" />
    </div>
  )
}
