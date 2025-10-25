import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AfterLogin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const role = (session.user as any)?.role as string | undefined
  // Серверный редирект по роли — без мерцания
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      redirect('/admin')
    case 'ACCOUNTANT':
      redirect('/admin/payments')
    case 'LOGOPED':
      redirect('/logoped')
    case 'PARENT':
      redirect('/parent')
    default:
      redirect('/')
  }
}
