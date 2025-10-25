"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ChatUnreadBadge from "@/components/chat/ChatUnreadBadge";
import NotificationsBadge from "@/components/notifications/NotificationsBadge";
// Используем emoji-иконки для гарантированного отображения на всех устройствах

export type BottomTab = {
  key: string;
  href: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string | null;
};

export default function MobileBottomNav({ tabs }: { tabs: BottomTab[] }) {
  const pathname = usePathname();
  // Семантический ключ пункта меню для строгой дедупликации
  function semanticKey(t: BottomTab): string {
    const k = (t.key || '').toLowerCase()
    const h = (t.href || '').toLowerCase()
    const l = (t.label || '').toLowerCase()
    if (k === 'home' || h === '/' || h === '/home' || l.includes('глав')) return 'home'
    if (isChatTab(t) || l.includes('чат')) return 'chat'
    if (isNotificationsTab(t) || l.includes('увед')) return 'notifications'
    if (k === 'schedule' || h.includes('schedule') || l.includes('распис')) return 'schedule'
    if (k === 'clients' || h.includes('client') || l.includes('клиент') || l.includes('дети')) return 'clients'
    if (k === 'profile' || h.includes('profile') || l.includes('проф')) return 'profile'
    if (k === 'settings' || h.includes('setting') || l.includes('настр')) return 'settings'
    return `other:${k}|${h}|${l}`
  }
  // Дедупликация по семантике — удаляем повторы (оставляем первый встречный)
  const filteredTabs = React.useMemo(() => {
    const out: BottomTab[] = []
    const seen = new Set<string>()
    for (const t of tabs || []) {
      const sig = semanticKey(t)
      if (seen.has(sig)) continue
      seen.add(sig)
      out.push(t)
    }
    return out
  }, [tabs])
  function renderIcon(t: BottomTab) {
    if (t.icon && React.isValidElement(t.icon)) return t.icon;
    // по ключу
    switch ((t.key || '').toLowerCase()) {
      case 'home': return <span role="img" aria-label="home">🏠</span>
      case 'chat':
      case 'messages': return <span role="img" aria-label="chat">💬</span>
      case 'notifications':
      case 'alerts': return <span role="img" aria-label="bell">🔔</span>
      case 'schedule': return <span role="img" aria-label="calendar">📅</span>
      case 'clients': return <span role="img" aria-label="clients">👥</span>
      case 'profile': return <span role="img" aria-label="user">👤</span>
      case 'settings': return <span role="img" aria-label="settings">⚙️</span>
      default: return iconByLabel(t) || fallbackIconByHref(t)
    }
  }

  function isChatTab(t: BottomTab) {
    const k = (t.key || '').toLowerCase()
    const h = (t.href || '').toLowerCase()
    return k === 'chat' || k === 'messages' || h.startsWith('/chat')
  }
  function isNotificationsTab(t: BottomTab) {
    const k = (t.key || '').toLowerCase()
    const h = (t.href || '').toLowerCase()
    return k === 'notifications' || k === 'alerts' || h.includes('notification') || h.startsWith('/logoped/notifications')
  }
  function fallbackIconByHref(t: BottomTab) {
    const h = (t.href || '').toLowerCase()
    if (h === '/' || h === '/home') return <span role="img" aria-label="home">🏠</span>
    if (h.startsWith('/chat')) return <span role="img" aria-label="chat">💬</span>
    if (h.includes('notification')) return <span role="img" aria-label="bell">🔔</span>
    if (h.includes('schedule')) return <span role="img" aria-label="calendar">📅</span>
    if (h.includes('client')) return <span role="img" aria-label="clients">👥</span>
    if (h.includes('profile')) return <span role="img" aria-label="user">👤</span>
    if (h.includes('setting')) return <span role="img" aria-label="settings">⚙️</span>
    return <span role="img" aria-label="menu">🧭</span>
  }

  function iconByLabel(t: BottomTab) {
    const L = (t.label || '').toLowerCase()
    if (!L) return null
    if (L.includes('чат')) return <span role="img" aria-label="chat">💬</span>
    if (L.includes('увед')) return <span role="img" aria-label="bell">🔔</span>
    if (L.includes('распис')) return <span role="img" aria-label="calendar">📅</span>
    if (L.includes('клиент') || L.includes('дети') || L.includes('семья')) return <span role="img" aria-label="clients">👥</span>
    if (L.includes('проф')) return <span role="img" aria-label="user">👤</span>
    if (L.includes('настр')) return <span role="img" aria-label="settings">⚙️</span>
    if (L.includes('глав') || L.includes('домой')) return <span role="img" aria-label="home">🏠</span>
    return <span role="img" aria-label="menu">🧭</span>
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white supports-[backdrop-filter]:bg-white/80 h-16 pointer-events-auto" aria-label="Основная навигация">
      <ul className="grid grid-cols-5 gap-1 px-1 py-1 max-w-screen-md mx-auto overflow-hidden select-none">
        {filteredTabs.map((t) => {
          const active = pathname?.startsWith(t.href);
          return (
            <li key={t.key} className="relative">
              <Link
                href={t.href}
                className={
                  "flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] rounded-md transition-colors whitespace-nowrap touch-manipulation " +
                  (active ? "font-medium" : "text-muted hover:opacity-80")
                }
                style={active ? { color: 'var(--brand)' } : undefined}
                aria-current={active ? "page" : undefined}
              >
                <span className="inline-block w-6 text-[18px] leading-none text-center align-middle" aria-hidden="true">{renderIcon(t)}</span>
                <span className="leading-none">{t.label}</span>
              </Link>
              {active && (
                <span aria-hidden className="pointer-events-none absolute top-0 left-2 right-2 h-0.5 rounded-full" style={{ background: 'var(--brand)' }} />
              )}
              {isChatTab(t) ? (
                <span className="absolute -top-1 right-3">
                  <ChatUnreadBadge />
                </span>
              ) : isNotificationsTab(t) ? (
                <span className="absolute -top-1 right-3">
                  <NotificationsBadge />
                </span>
              ) : t.badge ? (
                <span className="absolute -top-1 right-3 inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px]">{t.badge}</span>
              ) : t.badge === 'dot' ? (
                <span className="absolute -top-0.5 right-3 inline-block w-2 h-2 rounded-full bg-rose-500" />
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
