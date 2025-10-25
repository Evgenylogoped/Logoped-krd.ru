export async function verifyTurnstile(token: string | null | undefined, remoteIp?: string) {
  const secret = process.env.TURNSTILE_SECRET
  if (!secret) return { ok: true, reason: 'no-secret' }
  if (!token) return { ok: false, reason: 'missing-token' }
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: remoteIp }),
    })
    const data = await resp.json()
    return { ok: Boolean(data.success), reason: data['error-codes']?.[0] || 'ok' }
  } catch (e) {
    return { ok: false, reason: 'fetch-error' }
  }
}
