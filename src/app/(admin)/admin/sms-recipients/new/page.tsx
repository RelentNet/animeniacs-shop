import { SmsRecipientForm } from '@/app/(admin)/admin/sms-recipients/_components/SmsRecipientForm'
import { createSmsRecipientAction } from './actions'

export const metadata = { title: 'New SMS recipient — admin' }

export default function NewSmsRecipientPage(): JSX.Element {
  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>New SMS recipient</h1>
      <p>
        Phone must be in E.164 format (e.g. <code>+14155552671</code>). Once created, the number
        becomes read-only — delete and re-add if it needs to change.
      </p>
      <SmsRecipientForm action={createSmsRecipientAction} mode="create" />
    </div>
  )
}
