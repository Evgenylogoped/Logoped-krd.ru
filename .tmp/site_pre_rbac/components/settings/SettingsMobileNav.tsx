"use client"
import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useState, useMemo } from "react"
import Icon from "@/components/Icon"

function Section({ id, title, icon, children, defaultOpen=false }: { id: string; title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  // persist state per section
  const storageKey = `settings.section.${id}`
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === '1') setOpen(true)
      if (raw === '0') setOpen(false)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  React.useEffect(() => {
    try { localStorage.setItem(storageKey, open ? '1' : '0') } catch {}
  }, [open, storageKey])
  return (
    <div className="rounded border bg-white overflow-hidden">
      <button type="button" onClick={()=>setOpen(v=>!v)} className="w-full flex items-center justify-between px-3 py-2 active:opacity-80 transition">
        <span className="flex items-center gap-2 font-medium text-sm">
          {icon}
          {title}
        </span>
        <span className={`text-muted text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      <div className={`px-3 pt-0 pb-0 grid gap-1 text-sm transition-[max-height,padding] duration-200 ${open ? 'max-h-[400px] pb-3 pt-1' : 'max-h-0 overflow-hidden'}`}>
        {children}
      </div>
    </div>
  )
}

export default function SettingsMobileNav() {
  const { data } = useSession()
  const role = (data?.user as any)?.role as string | undefined
  const pathname = usePathname()
  const isParent = role === 'PARENT'
  const isLogopedOrAdmin = role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN'

  const LinkBtn = ({ href, children, icon }: { href: string; children: React.ReactNode; icon?: React.ReactNode }) => (
    <Link href={href} className={`btn btn-ghost justify-start flex items-center gap-2 ${pathname === href ? 'btn-primary' : ''}`}>
      {icon}
      <span>{children}</span>
    </Link>
  )

  const defaults = useMemo(() => ({
    account: pathname?.startsWith('/settings/profile') || pathname?.startsWith('/settings/password') || pathname?.startsWith('/settings/notifications') || pathname?.startsWith('/settings/schedule/template'),
    family: pathname?.startsWith('/settings/children'),
    org: pathname?.startsWith('/settings/organization'),
  }), [pathname])

  return (
    <div className="grid gap-2 md:hidden">
      <Section id="account" title="Аккаунт" icon={<Icon name="settings" />} defaultOpen={!!defaults.account}>
        <LinkBtn href="/settings/profile" icon={<Icon name="settings" />}>Профиль</LinkBtn>
        <LinkBtn href="/settings/password" icon={<Icon name="settings" />}>Пароль</LinkBtn>
        <LinkBtn href="/settings/notifications" icon={<Icon name="bell" />}>Уведомления</LinkBtn>
        <LinkBtn href="/settings/schedule/template" icon={<Icon name="calendar" />}>Шаблон недели</LinkBtn>
      </Section>

      {isParent && (
        <Section id="family" title="Семья" icon={<Icon name="clients" />} defaultOpen={!!defaults.family}>
          <LinkBtn href="/settings/children" icon={<Icon name="clients" />}>Дети</LinkBtn>
        </Section>
      )}

      {isLogopedOrAdmin && (
        <Section id="org" title="Организация" icon={<Icon name="settings" />} defaultOpen={!!defaults.org}>
          <LinkBtn href="/settings/organization" icon={<Icon name="settings" />}>Организация и филиалы</LinkBtn>
          <LinkBtn href="/settings/organization/request" icon={<Icon name="plus" />}>Заявка на организацию</LinkBtn>
          <LinkBtn href="/settings/organization/membership" icon={<Icon name="login" />}>Запрос на вступление</LinkBtn>
          <LinkBtn href="/settings/organization/memberships" icon={<Icon name="bell" />}>Входящие запросы</LinkBtn>
        </Section>
      )}

      {/* Раздел расписания перенесен в Аккаунт */}
    </div>
  )
}
