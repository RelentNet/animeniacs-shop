import { SmsRecipientForm } from '@/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm'
import { createSmsRecipientAction } from './actions'

export const metadata = { title: 'New SMS recipient — admin' }

export default function NewSmsRecipientPage(): JSX.Element {
  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-2 font-display text-3xl tracking-wide text-bone sm:text-4xl">
        New SMS recipient
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Phone must be in E.164 format (e.g.{' '}
        <code className="font-mono text-purple-soft">+14155552671</code>
        ). Once created, the number becomes read-only — delete and re-add if it needs to change.
      </p>
      <div className="mt-6">
        <SmsRecipientForm action={createSmsRecipientAction} mode="create" />
      </div>
    </div>
  )
}
