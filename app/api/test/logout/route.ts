import { NextResponse } from 'next/server'

export async function GET() {
  // Always return 200 HTML and perform client-side redirect to avoid HTTP Location rewrites
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Logout</title></head><body><script>try{window.location.replace('/')}catch(e){window.location.href='/'}</script>OK</body></html>`
  const res = new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  // Clear both cookie variants just in case
  res.cookies.set('__Secure-next-auth.session-token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: true,
    domain: 'logoped-krd.ru',
    maxAge: 0,
  })
  res.cookies.set('next-auth.session-token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: true,
    domain: 'logoped-krd.ru',
    maxAge: 0,
  })
  return res
}
