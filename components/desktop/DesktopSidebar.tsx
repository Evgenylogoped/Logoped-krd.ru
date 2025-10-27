"use client"
import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import Icon from "@/components/Icon"
import ChatUnreadBadge from "@/components/chat/ChatUnreadBadge"
import NotificationsBadge from "@/components/notifications/NotificationsBadge"
import SchedulePendingBadge from "@/components/schedule/SchedulePendingBadge"
import PayoutsPendingBadge from "@/components/finance/PayoutsPendingBadge"
import LogopedOrgFinanceBadge from "@/components/finance/LogopedOrgFinanceBadge"

function Item({ href, icon, label, title, collapsed=false }: { href: string; icon: React.ReactNode; label: string; title?: string; collapsed?: boolean }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== "/" && pathname.startsWith(href))
  return (
    <Link
      href={href}
      title={title || label}
      className={`sidebar-item ${collapsed ? 'gap-0 justify-center' : ''} ${active ? 'active' : ''}`}
      style={active ? { color: 'var(--brand)' } : undefined}
    >
      <span className="text-lg w-5 text-center">{icon}</span>
      <span className={`${collapsed ? 'sr-only' : 'truncate'}`}>{label}</span>
    </Link>
  )
}

export default function DesktopSidebar({ role: roleProp, city: cityProp }: { role?: string; city?: string }) {
  // Стабильный источник прав — только пропсы от сервера
  const role = (roleProp as any)
  const roleU = (role || '').toUpperCase()
  const [pinned, setPinned] = React.useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return true;
      const v = localStorage.getItem("sidebar.pinned");
      if (v === "1") return true;
      if (v === "0") return false;
      return window.matchMedia && window.matchMedia('(min-width: 1280px)').matches;
    } catch {
      return true;
    }
  })
  const cityRaw = (cityProp as string | undefined)?.trim()
  // Флаги по умолчанию теперь зависят от роли, чтобы не прятать разделы
  const isLeader = ['ADMIN','SUPER_ADMIN','ACCOUNTANT','SUPERVISOR','OWNER','LEADER','MANAGER','ORGANIZER'].includes(roleU)
  const inOrg = true
  const plan: 'beta'|'free'|'pro'|'pro_plus'|'max' = 'pro_plus'

  function togglePin() {
    const next = !pinned
    setPinned(next)
    try { localStorage.setItem('sidebar.pinned', next ? '1' : '0') } catch {}
  }

  React.useLayoutEffect(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const mq = window.matchMedia('(min-width: 1024px)');
  const apply = () => {
    if (mq.matches) {
      document.body.classList.add('sidebar-present');
      document.body.classList.toggle('sidebar-pinned', pinned);
    } else {
      document.body.classList.remove('sidebar-present');
      document.body.classList.remove('sidebar-pinned');
    }
  };
  try { localStorage.setItem('sidebar.pinned', pinned ? '1' : '0') } catch {}
  apply();
  const handler = () => apply();
  mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
  return () => {
    mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler);
    document.body.classList.remove('sidebar-present');
    document.body.classList.remove('sidebar-pinned');
  };
}, [pinned])

  function toPrepositionalCity(city?: string) {
    if (!city) return ''
    const c = city.trim()
    const lower = c.toLowerCase()
    if (lower.endsWith('ия')) return c.slice(0, -2) + 'ии'
    if (lower.endsWith('ие')) return c.slice(0, -2) + 'ии'
    if (lower.endsWith('а')) return c.slice(0, -1) + 'е'
    if (lower.endsWith('я')) return c.slice(0, -1) + 'е'
    if (lower.endsWith('й')) return c.slice(0, -1) + 'е'
    if (lower.endsWith('ь')) return c.slice(0, -1) + 'и'
    if (/[бвгджзйклмнпрстфхцчшщ]$/i.test(lower)) return c + 'е'
    return c
  }
  const cityPrep = toPrepositionalCity(cityRaw)

  // один aside: ширина зависит от pinned; подписи скрываются при collapsed
  return (
    <>
      <aside
        className={`hidden md:flex fixed inset-y-0 left-0 ${pinned ? 'w-[240px]' : 'w-[72px]'} border-r border-gray-200 z-30 flex-col`}
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      > 
        <div className="relative">
          <button className="btn btn-ghost btn-sm h-9 absolute top-3 left-2" onClick={togglePin} title={pinned ? 'Свернуть меню' : 'Развернуть меню'}>≡</button>
          <div className="h-14" />
        </div>
        <div className="px-2 pb-3 overflow-auto">
          {/* Главная */}
          <div className="mb-3">
            <div className="grid gap-1">
              {(() => {
                const isAdminLike = roleU === 'ADMIN' || roleU === 'SUPER_ADMIN' || roleU === 'ACCOUNTANT'
                const homeHref = roleU === 'LOGOPED' ? '/logoped' : (isAdminLike ? '/admin' : (roleU === 'PARENT' ? '/parent' : '/'))
                return <Item href={homeHref} icon={<Icon name="home" />} label="Главная" collapsed={!pinned} />
              })()}
            </div>
          </div>
          {roleU === 'PARENT' && (
            <div className="mb-3">
              <div className="grid gap-1">
                <Item href="/parent/lessons" icon={<Icon name="calendar" />} label="Занятия" collapsed={!pinned} />
                <Item href="/parent/enrollments" icon={<Icon name="search" />} label="Запись/Активация" collapsed={!pinned} />
                <Item href="/parent/logopeds" icon={<Icon name="clients" />} label="Логопеды" collapsed={!pinned} />
              </div>
            </div>
          )}
          {roleU === 'LOGOPED' && (
            <div className="mb-3">
              <div className="grid gap-1">
                <div className="relative">
                  <Item href="/logoped/schedule" icon={<Icon name="calendar" />} label="Расписание" collapsed={!pinned} />
                  <div className="absolute top-1 right-2">
                    <SchedulePendingBadge />
                  </div>
                </div>
                <Item href="/logoped/clients" icon={<Icon name="clients" />} label="Клиенты" collapsed={!pinned} />
                {/* Личные финансы доступны всем логопедам и лидерам */}
                <Item href="/logoped/finance" icon={<Icon name="settings" />} label="Лич. финансы" collapsed={!pinned} />
                {/* Организационные финансы обычного логопеда */}
                {inOrg && !isLeader && (
                  <div className="relative">
                    <Item href="/logoped/org-finance" icon={<Icon name="settings" />} label="Лог. финансы" collapsed={!pinned} />
                    <div className="absolute top-1 right-2">
                      <LogopedOrgFinanceBadge />
                    </div>
                  </div>
                )}
                {/* Финансы руководителя/владельца */}
                {isLeader && (
                  <div className="relative">
                    <Item href="/logoped/branch-finance" icon={<Icon name="settings" />} label="Рук. финансы" collapsed={!pinned} />
                    <div className="absolute top-1 right-2">
                      <PayoutsPendingBadge />
                    </div>
                  </div>
                )}
                <div className="relative">
                  <Item href="/logoped/notifications" icon={<Icon name="bell" />} label="Уведомления" collapsed={!pinned} />
                  <div className="absolute top-1 right-2">
                    <NotificationsBadge />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="mb-3">
            <div className="grid gap-1">
              <div className="relative">
                <Item href="/chat" icon={<Icon name="max" />} label="Чат" collapsed={!pinned} />
                <div className="absolute top-1 right-2">
                  <ChatUnreadBadge />
                </div>
              </div>
            </div>
          </div>
          {role === 'LOGOPED' && (
            <div className="mb-3">
              <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Организация</div>
              <div className="grid gap-1">
                {(plan !== 'free') && <Item href="/settings/organization" icon={<Icon name="settings" />} label="Компания и филиалы" collapsed={!pinned} />}
                {(plan !== 'free') && <Item href="/logoped/organization/request" icon={<Icon name="plus" />} label="Заявка на организацию" collapsed={!pinned} />}
                {(plan !== 'free') && <Item href="/logoped/organization/membership" icon={<Icon name="login" />} label="Запрос на вступление" collapsed={!pinned} />}
                {(plan !== 'free') && <Item href="/settings/organization/memberships" icon={<Icon name="bell" />} label="Входящие запросы" collapsed={!pinned} />}
              </div>
            </div>
          )}
          <div className="mb-3">
            <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Настройки</div>
            <div className="grid gap-1">
              <Item href="/settings/profile" icon={<Icon name="user" />} label="Профиль" collapsed={!pinned} />
              <Item href="/settings/password" icon={<Icon name="lock" />} label="Пароль" collapsed={!pinned} />
              <Item href="/settings/billing" icon={<Icon name="login" />} label="Подписка" collapsed={!pinned} />
              {roleU === 'LOGOPED' && plan !== 'free' && (
                <Item href="/settings/schedule/template" icon={<Icon name="calendar" />} label="Шаблон недели" collapsed={!pinned} />
              )}
            </div>
          </div>
          {role === 'PARENT' && (
            <div className="mb-3">
              <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Семья</div>
              <div className="grid gap-1">
                <Item href="/settings/children" icon={<Icon name="clients" />} label="Дети" collapsed={!pinned} />
              </div>
            </div>
          )}
          {(roleU === 'ADMIN' || roleU === 'SUPER_ADMIN' || roleU === 'ACCOUNTANT') && (
            <div className="mb-3">
              <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Админ</div>
              <div className="grid gap-1">
                <Item href="/admin/organizations" icon={<Icon name="settings" />} label="Организации" collapsed={!pinned} />
                <Item href="/admin/branches" icon={<Icon name="settings" />} label="Филиалы" collapsed={!pinned} />
                <Item href="/admin/groups" icon={<Icon name="clients" />} label="Группы" collapsed={!pinned} />
                <Item href="/admin/logopeds" icon={<Icon name="clients" />} label="Логопеды" collapsed={!pinned} />
                <Item href="/admin/clients" icon={<Icon name="clients" />} label="Клиенты" collapsed={!pinned} />
                <Item href="/admin/org-requests" icon={<Icon name="bell" />} label="Заявки" collapsed={!pinned} />
                <Item href="/admin/users" icon={<Icon name="user" />} label="Пользователи" collapsed={!pinned} />
                <Item href="/admin/payments" icon={<Icon name="login" />} label="Платежи" collapsed={!pinned} />
                <Item href="/admin/finance" icon={<Icon name="settings" />} label="Финансы" collapsed={!pinned} />
                <Item href="/admin/audit" icon={<Icon name="max" />} label="Аудит" collapsed={!pinned} />
                <Item href="/admin/search" icon={<Icon name="search" />} label="Поиск" collapsed={!pinned} />
                <Item href="/admin/vip" icon={<Icon name="star" />} label="VIP" collapsed={!pinned} />
                <Item href="/admin/subscriptions" icon={<Icon name="settings" />} label="Подписки" collapsed={!pinned} />
                <div className={`${pinned ? 'ml-6' : 'sr-only'} grid gap-1`}>
                  <Item href="/admin/subscriptions/requests" icon={<span>•</span>} label="Заявки на смену" collapsed={!pinned} />
                  <Item href="/admin/subscriptions/limit-requests" icon={<span>•</span>} label="Лимит‑заявки" collapsed={!pinned} />
                </div>
                            {roleU === 'SUPER_ADMIN' && (<Item href="/admin/backups" icon={<Icon name="settings" />} label="Бэкапы" collapsed={!pinned} />)}
                  {roleU === 'SUPER_ADMIN' && (<Item href="/admin/system/gui" icon={<Icon name="settings" />} label="Системное администрирование" collapsed={!pinned} />)}
                <Item href="/admin/tools/purge" icon={<Icon name="settings" />} label="Очистка" collapsed={!pinned} />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
