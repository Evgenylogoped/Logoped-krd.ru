import React from "react";
import { getPlanPrices, getConfigLimits } from "@/lib/subscriptions";

function formatRub(v: number | null | undefined): string {
  if (v == null) return "—";
  try { return `${Number(v).toLocaleString('ru-RU')} ₽`; } catch { return `${v} ₽`; }
}

export default async function Subscriptions() {
  const [prices, limits] = await Promise.all([getPlanPrices(), getConfigLimits()])
  const plans = [
    {
      key: 'beta',
      name: 'BETA',
      badge: 'тестовый доступ',
      price: '0 ₽',
      period: '',
      bullets: [
        `Филиалы: ${limits.beta.branches}`,
        `Логопеды: ${limits.beta.logopeds}`,
        `Медиа: ${limits.beta.mediaMB} MB`,
      ],
      cta: { label: 'Начать', href: '/register' },
    },
    {
      key: 'free',
      name: 'FREE',
      badge: 'для старта',
      price: '0 ₽',
      period: '',
      bullets: [
        `Филиалы: ${limits.free.branches}`,
        `Логопеды: ${limits.free.logopeds}`,
        `Медиа: ${limits.free.mediaMB} MB`,
      ],
      cta: { label: 'Начать', href: '/register' },
    },
    {
      key: 'pro',
      name: 'PRO',
      badge: 'для логопеда',
      price: formatRub(prices.pro.month),
      period: '/мес',
      highlight: true,
      bullets: [
        `Филиалы: ${limits.pro.branches}`,
        `Логопеды: ${limits.pro.logopeds}`,
        `Медиа: ${limits.pro.mediaMB} MB`,
      ],
      cta: { label: 'Оформить', href: '/login' },
    },
    {
      key: 'pro_plus',
      name: 'PRO+',
      badge: 'для практики',
      price: formatRub(prices.pro_plus.month),
      period: '/мес',
      bullets: [
        `Филиалы: ${limits.pro_plus.branches}`,
        `Логопеды: ${limits.pro_plus.logopeds}`,
        `Медиа: ${limits.pro_plus.mediaMB} MB`,
        `Поддержка: приоритетная`,
      ],
      cta: { label: 'Оформить', href: '/login' },
    },
    {
      key: 'max',
      name: 'MAX',
      badge: 'для организации',
      price: formatRub(prices.max.month),
      period: '/мес',
      bullets: [
        `Филиалы: ${limits.max.branches}`,
        `Логопеды: ${limits.max.logopeds}`,
        `Медиа: ${limits.max.mediaMB} MB`,
        `Статистика филиалов: ${limits.max.stats.branch ? 'да' : 'нет'}`,
      ],
      cta: { label: 'Запросить', href: '/settings/billing' },
    },
  ] as const

  return (
    <section className="mx-auto max-w-screen-xl px-4 py-12 sm:py-16">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Подписки</h2>
        <p className="mt-2 text-muted">Цены и лимиты подтягиваются из админки автоматически.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-5">
        {plans.map((p) => (
          <div key={p.key} className={`rounded-2xl border bg-white p-6 relative ${((p as any).highlight ? 'ring-2 ring-indigo-500 shadow-lg' : '')}`}>
            <div className="text-xs uppercase tracking-wide text-indigo-600">{p.badge}</div>
            <div className="mt-1 text-lg font-semibold">{p.name}</div>
            <div className="mt-3 text-4xl font-extrabold">{p.price} <span className="text-base font-medium text-muted">{p.period}</span></div>
            <ul className="mt-4 space-y-2 text-sm">
              {p.bullets.map((b)=> (
                <li key={b} className="flex items-start gap-2"><span className="emoji-bubble">✓</span><span>{b}</span></li>
              ))}
            </ul>
            <div className="mt-6">
              <a href={p.cta.href} className={`btn ${((p as any).highlight ? 'btn-primary btn-shine' : 'btn-outline')}`}>{p.cta.label}</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}







