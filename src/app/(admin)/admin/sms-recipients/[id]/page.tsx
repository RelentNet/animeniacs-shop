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
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
        Edit SMS recipient: {recipient.label ?? recipient.phone}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Phone is read-only (delete + re-add if it needs to change). Toggle status to pause
        notifications without losing the row.
      </p>
      <div className="mt-6">
        <SmsRecipientForm action={boundAction} initial={recipient} mode="edit" />
      </div>
    </div>
  )
}
