import 'server-only'

export interface SendDiscordArgs {
  webhookUrl: string
  orderId: string
  totalCents: number
  itemCount: number
  buyerEmail: string | null
}

export async function sendDiscordOrderNotification(args: SendDiscordArgs): Promise<void> {
  const fields = [
    { name: 'Order', value: args.orderId, inline: true },
    { name: 'Total', value: `$${(args.totalCents / 100).toFixed(2)}`, inline: true },
    { name: 'Items', value: String(args.itemCount), inline: true }
  ]
  if (args.buyerEmail) {
    fields.push({ name: 'Buyer', value: args.buyerEmail, inline: false })
  }

  const body = {
    embeds: [
      {
        title: 'New order on animeniacs.shop',
        color: 0x00b894,
        fields,
        timestamp: new Date().toISOString()
      }
    ]
  }

  try {
    await fetch(args.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (err) {
    // Caller-handled. Webhook handler logs but does not 500 to Square.
    console.error('[discord] notification failed:', err)
  }
}
