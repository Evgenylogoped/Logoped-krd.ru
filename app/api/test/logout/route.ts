import { NextResponse } from 'next/server'

export async function GET() {
  // Always return 200 HTML and perform client-side redirect to avoid HTTP Location rewrites
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Logout</title></head><body><script>try{window.location.replace('/')}catch(e){window.location.href='/'}</script>OK</body></html>`
  const res = new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  // Aggressively clear all common NextAuth cookies (with/without domain, __Secure/__Host variants)
  const names = [
    '__Secure-next-auth.session-token',
    'next-auth.session-token',
    '__Host-next-auth.session-token',
    '__Secure-next-auth.callback-url',
    'next-auth.callback-url',
    '__Host-next-auth.csrf-token',
    '__Secure-next-auth.csrf-token',
    'next-auth.csrf-token',
  ] as const
  for (const name of names) {
    // host-only
    res.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 0 })
    // explicit domain
    res.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', path: '/', secure: true, domain: 'logoped-krd.ru', maxAge: 0 })
    // also try SameSite=None for cases where it was set differently
    res.cookies.set(name, '', { httpOnly: true, sameSite: 'none', path: '/', secure: true, maxAge: 0 })
    res.cookies.set(name, '', { httpOnly: true, sameSite: 'none', path: '/', secure: true, domain: 'logoped-krd.ru', maxAge: 0 })
  }
  return res
}
