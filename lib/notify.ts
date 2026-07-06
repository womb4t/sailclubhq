// Notification helpers: SMS via Twilio, email via SendGrid.
// Each is independent and a no-op (returns skipped) when its creds are absent,
// so email can go live before the Twilio UK number is provisioned.
//
// Env vars (set in Vercel project settings):
//   TWILIO_ACCOUNT_SID            (AC...)
//   TWILIO_AUTH_TOKEN
//   TWILIO_MESSAGING_SERVICE_SID  (MG...)  — preferred sender
//   TWILIO_FROM_NUMBER            (+44...) — fallback if no messaging service
//   SENDGRID_API_KEY              (SG...)
//   SENDGRID_FROM_EMAIL           (verified single sender)
//   SENDGRID_FROM_NAME            (optional, defaults "Waypoint Racing")

type SendResult = { ok: boolean; skipped?: boolean; error?: string }

// ── SMS ──────────────────────────────────────────────────────────────────
export async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const auth = process.env.TWILIO_AUTH_TOKEN
  const svc = process.env.TWILIO_MESSAGING_SERVICE_SID
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !auth || (!svc && !from)) return { ok: false, skipped: true }
  if (!to) return { ok: false, skipped: true }

  const params = new URLSearchParams()
  params.set('To', normalisePhone(to))
  params.set('Body', body)
  if (svc) params.set('MessagingServiceSid', svc)
  else params.set('From', from!)

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!res.ok) {
      const t = await res.text()
      return { ok: false, error: `twilio ${res.status}: ${t.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Email ────────────────────────────────────────────────────────────────
export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<SendResult> {
  const key = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!key || !fromEmail) return { ok: false, skipped: true }
  if (!to) return { ok: false, skipped: true }
  const fromName = process.env.SENDGRID_FROM_NAME || 'Waypoint Racing'

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [
          { type: 'text/plain', value: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() },
          { type: 'text/html', value: html },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      return { ok: false, error: `sendgrid ${res.status}: ${t.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// UK-friendly E.164 normalisation. Leaves already-+ numbers alone; converts
// leading 0 to +44 (best-effort — full validation is Twilio's job).
export function normalisePhone(raw: string): string {
  const p = raw.replace(/[\s()-]/g, '')
  if (p.startsWith('+')) return p
  if (p.startsWith('0')) return '+44' + p.slice(1)
  return p
}
