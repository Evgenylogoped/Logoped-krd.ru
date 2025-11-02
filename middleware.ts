import { withAuth, type NextRequestWithAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const role = (req.nextauth?.token as { role?: string } | undefined)?.role
    const url = req.nextUrl
    const path = url.pathname

    const adminBlockLogoped = String(process.env.ADMIN_BLOCK_LOGOPED_UI || '').toLowerCase()
    const blockAdminsOnLogoped = adminBlockLogoped === '1' || adminBlockLogoped === 'true'
    const needRoles: Record<string, string[]> = {
      // finance area: пропускаем и LOGOPED, дальше серверная страница проверит владельца/менеджера
      '/admin/finance': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'LOGOPED'],
      // admin area
      '/admin/push': ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],
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
      // logoped area: фича-флаг
      // Если ADMIN_BLOCK_LOGOPED_UI=1|true — доступ только LOGOPED
      // Иначе разрешаем ADMIN/SUPER_ADMIN тоже (для тестирования)
      '/logoped/schedule': blockAdminsOnLogoped ? ['LOGOPED'] : ['ADMIN','SUPER_ADMIN','LOGOPED'],
      '/logoped': blockAdminsOnLogoped ? ['LOGOPED'] : ['ADMIN','SUPER_ADMIN','LOGOPED'],
      // parent area
      '/parent': ['PARENT'],
    }

    // Проверяем самые специфичные правила раньше (длиннее префикс)
    const entries = Object.entries(needRoles).sort((a,b)=>b[0].length - a[0].length)
    for (const [prefix, roles] of entries) {
      if (path.startsWith(prefix)) {
        // Если токен есть, но роль ещё не подставилась (первый запрос после логина),
        // пропускаем и даём серверной странице сделать строгую проверку, чтобы избежать мерцания.
        const hasToken = !!req.nextauth?.token
        if (hasToken && !role) {
          return NextResponse.next()
        }
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
