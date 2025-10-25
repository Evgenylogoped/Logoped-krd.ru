export type MailOptions = { to: string; subject: string; html?: string; text?: string }

let transporter: any = null

async function ensureTransporter(): Promise<any | null> {
  if (transporter) return transporter
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env as any
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- optional dependency, types may be missing in dev
    const nodemailer = await import('nodemailer')
    transporter = (nodemailer as any).createTransport({
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
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'} as any)[c])
}
