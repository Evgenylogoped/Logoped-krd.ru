import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import SettingsMobileNav from '@/components/settings/SettingsMobileNav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const sessionAny: any = await getServerSession(authOptions as any)
  const role: string | undefined = sessionAny?.user?.role
  const isParent = role === 'PARENT'
  const isLogopedOrAdmin = role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN'

  return (
    <>
      {/* Мобильная версия настроек: шапка + нав + контент */}
      <div className="md:hidden">
        <div className="container py-4">
          <div className="text-lg font-semibold mb-3">Настройки</div>
          <SettingsMobileNav />
          <div className="mt-4">{children}</div>
        </div>
      </div>

      {/* Десктоп: только контент, навигация слева общая в сайдбаре */}
      <div className="container py-6 hidden md:block">
        <main>{children}</main>
      </div>
    </>
  )
}
