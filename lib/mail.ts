export type MailOptions = { to: string; subject: string; html?: string; text?: string }

type MinimalTransporter = { sendMail: (opts: { from: string; to: string; subject: string; text?: string; html?: string }) => Promise<unknown> }
let transporter: MinimalTransporter | null = null

async function ensureTransporter(): Promise<MinimalTransporter | null> {
  if (transporter) return transporter
  const env = process.env as Partial<Record<string, string | undefined>>
  const SMTP_HOST = env.SMTP_HOST
  const SMTP_PORT = env.SMTP_PORT
  const SMTP_USER = env.SMTP_USER
  const SMTP_PASS = env.SMTP_PASS
  const SMTP_SECURE = env.SMTP_SECURE
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- optional dependency, types may be missing in dev
    const nodemailer: { createTransport: (cfg: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }) => MinimalTransporter } = await import('nodemailer') as unknown as { createTransport: (cfg: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }) => MinimalTransporter }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE || '').toLowerCase() === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    return transporter
  } catch {
    return null
  }
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const t = await ensureTransporter()
  if (!t) return
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com'
  const html = opts.html || (opts.text ? renderHtml(opts.subject, opts.text) : undefined)
  await t.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html })
}

function renderHtml(title: string, message: string) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f6f7fb; padding:24px;">
      <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
        <tr><td style="padding:24px 24px 8px; font-size:18px; font-weight:600; color:#111827;">${escapeHtml(title)}</td></tr>
        <tr><td style="padding:0 24px 24px; font-size:14px; color:#374151; line-height:1.6;">${escapeHtml(message).replace(/\n/g,'<br/>')}</td></tr>
        <tr><td style="padding:12px 24px 20px; font-size:12px; color:#6b7280; border-top:1px solid #e5e7eb;">Это письмо отправлено автоматически. Не отвечайте на него.</td></tr>
      </table>
    </body>
  </html>`
}

function escapeHtml(s: string){
  const map: Record<string, string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}
  return s.replace(/[&<>"']/g, (c) => map[c] || c)
}
