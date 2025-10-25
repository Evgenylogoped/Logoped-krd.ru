import Link from 'next/link'
import { ReactNode } from 'react'
import { headers } from 'next/headers'

async function Tab({ href, label }: { href: string; label: string }) {
  const h = await headers()
  const path = h.get('x-pathname') || ''
  const active = path === href || (href !== '/admin/finance' && path.startsWith(href))
  return (
    <Link href={href} className={`px-3 py-2 text-sm ${active ? 'text-[var(--brand)] font-medium' : 'text-muted'}`}>{label}</Link>
  )
}

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top tabs (visible on md+) */}
      <div className="hidden md:flex items-center gap-2 border-b px-4 h-11">
        <Tab href="/admin/finance" label="Разделы" />
        <Tab href="/admin/finance/dashboard" label="Дашборд" />
        <Tab href="/admin/finance/children" label="Дети" />
        <Tab href="/admin/finance/statistics" label="Статистика" />
        <Tab href="/admin/finance/archive" label="Архив" />
        <Tab href="/admin/finance/payouts" label="Выплаты" />
        <Tab href="/admin/finance/commissions" label="Проценты" />
        <Tab href="/admin/finance/passes" label="Абонементы" />
      </div>

      <div className="flex-1">{children}</div>

      {/* Bottom mobile nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t bg-[var(--background)] flex justify-around py-2 z-40">
        <Tab href="/admin/finance/dashboard" label="Дашборд" />
        <Tab href="/admin/finance/children" label="Дети" />
        <Tab href="/admin/finance/payouts" label="Выплаты" />
        <Tab href="/admin/finance/statistics" label="Стат." />
        <Tab href="/admin/finance/archive" label="Архив" />
      </nav>
      <div className="h-12 md:hidden" />
    </div>
  )
}
