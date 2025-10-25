import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth?.token as any)?.role as string | undefined
    const url = req.nextUrl
    const path = url.pathname

    const needRoles: Record<string, string[]> = {
      // finance area (allow LOGOPED; server pages will validate leader/owner)
      '/admin/finance': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'LOGOPED'],
      // admin area
      '/admin/logopeds': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/clients': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/companies': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/branches': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/groups': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/contracts': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/payments': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/org-requests': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin/organizations': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      '/admin': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
      // logoped area
      '/logoped/schedule': ['ADMIN', 'SUPER_ADMIN', 'LOGOPED'],
      '/logoped': ['ADMIN', 'SUPER_ADMIN', 'LOGOPED'],
      // parent area
      '/parent': ['PARENT'],
    }

    // Проверяем самые специфичные правила раньше (длиннее префикс)
    const entries = Object.entries(needRoles).sort((a,b)=>b[0].length - a[0].length)
    for (const [prefix, roles] of entries) {
      if (path.startsWith(prefix)) {
        if (!role || !roles.includes(role)) {
          return NextResponse.redirect(new URL('/login', req.url))
        }
        // Разрешено: прекращаем дальнейшие проверки
        return NextResponse.next()
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: [
    '/admin/:path*',
    '/logoped/:path*',
    '/parent/:path*',
  ],
}
