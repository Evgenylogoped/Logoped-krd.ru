"use client"
import React, { useMemo, useState } from 'react'

type Plan = 'beta' | 'free' | 'pro' | 'pro_plus' | 'max'

type PlanLimits = {
  branches: number
  logopeds: number
  mediaMB: number
  support: 'email' | 'priority'
  chat: { enabled: boolean; group: boolean }
  stats: { branch: boolean }
}

type PlanPrices = {
  month: number
  year: number
  forever?: number | null
}

export function PlanCard(props: {
  plan: Plan
  currentPlan: Plan
  limits: PlanLimits
  currentLimits: PlanLimits
  prices?: PlanPrices | null
  phone: string
  userEmail: string
  recommended?: boolean
  onRequest?: (formData: FormData) => Promise<void>
}) {
  const { plan, currentPlan, limits: L, currentLimits, prices, phone, userEmail, recommended, onRequest } = props
  const [open, setOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState(false)
  const [openOnline, setOpenOnline] = useState(false)
  const [period, setPeriod] = useState<'month'|'year'|'forever'>(plan==='free' ? 'forever' : 'month')

  const title = plan === 'pro_plus' ? 'Pro+' : plan.toUpperCase()

  const Icon = ({ ok }: { ok: boolean }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      className={`inline-block w-3.5 h-3.5 mr-1 align-[-2px] ${ok ? 'text-green-600' : 'text-red-600'}`}
      fill="currentColor"
    >
      {ok ? (
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
      ) : (
        <path fillRule="evenodd" d="M10 8.586l3.536-3.536a1 1 0 111.414 1.414L11.414 10l3.536 3.536a1 1 0 01-1.414 1.414L10 11.414l-3.536 3.536a1 1 0 01-1.414-1.414L8.586 10 5.05 6.464A1 1 0 116.464 5.05L10 8.586z" clipRule="evenodd" />
      )}
    </svg>
  )

  const badge = (ok: boolean, text: string, extra?: string) => (
    <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded border ${ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      <Icon ok={ok} />{text}{extra ? `: ${extra}` : ''}
    </span>
  )

  const wa = (s: string) => `https://wa.me/${encodeURIComponent(phone.replace(/[^+0-9]/g,''))}?text=${encodeURIComponent(s)}`

  const priceLine = prices ? `Цена: ${prices.month ? prices.month + '₽/мес' : '—'} · ${prices.year ? prices.year + '₽/год' : '—'}${typeof prices.forever === 'number' ? ' · навсегда: ' + prices.forever + '₽' : ''}` : ''

  // Compute changes modal data
  const changes = useMemo(() => {
    function cmpNum(label: string, from: number, to: number) {
      if (from === to) return null
      return { label, from: String(from), to: String(to) }
    }
    function cmpBool(label: string, from: boolean, to: boolean) {
      if (from === to) return null
      return { label, from: from ? 'да' : 'нет', to: to ? 'да' : 'нет' }
    }
    const arr = [
      cmpNum('Филиалы', currentLimits.branches, L.branches),
      cmpNum('Логопеды', currentLimits.logopeds, L.logopeds),
      cmpNum('Медиа (MB)', currentLimits.mediaMB, L.mediaMB),
      cmpBool('Поддержка — приоритетная', currentLimits.support === 'priority', L.support === 'priority'),
      cmpBool('Чат — личный', currentLimits.chat.enabled, L.chat.enabled),
      cmpBool('Чат — групповой', currentLimits.chat.group, L.chat.group),
      cmpBool('Статистика филиалов', currentLimits.stats.branch, L.stats.branch),
      cmpBool('Интерфейс — лич. финансы', currentPlan !== 'free', plan !== 'free'),
      cmpBool('Интерфейс — шаблон недели', currentPlan !== 'free', plan !== 'free'),
      cmpBool('Интерфейс — занятия на главной', currentPlan !== 'free', plan !== 'free'),
      cmpBool('Увеличение лимитов по запросу', currentPlan === 'max', plan === 'max'),
    ].filter(Boolean) as { label: string; from: string; to: string }[]
    return arr
  }, [currentLimits, L, currentPlan, plan])

  const isCurrent = plan === currentPlan

  return (
    <div className={`rounded-xl border p-3 sm:p-4 space-y-2 ${recommended ? 'ring-2 ring-green-200' : ''} shadow-sm`} style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', borderColor: 'rgba(255,255,255,0.4)' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-sm sm:text-base">{title}</div>
        <div className="flex items-center gap-1">
          {recommended && <span className="badge badge-success">Рекомендуем</span>}
          {isCurrent && <span className="badge">Текущий</span>}
          {plan === 'max' && <span className="badge badge-success" title="Можно запросить индивидуальное повышение лимитов">MAX умеет увеличение лимитов</span>}
        </div>
      </div>
      <ul className="text-xs sm:text-sm space-y-1">
        <li>
          Филиалы: <b>{L.branches}</b> · Логопеды: <b>{L.logopeds}</b> · Медиа: <b>{(L as any).mediaMB} MB</b>
        </li>
        <li>
          Поддержка:
          {badge(L.support==='priority', L.support==='priority'?'приоритетная':'email')}
        </li>
        <li>
          Чат:
          {badge(L.chat.enabled, 'личный')}
          {badge(L.chat.group, 'групповой')}
        </li>
        <li>
          Статистика филиалов:
          {badge(L.stats.branch, L.stats.branch ? 'доступна' : 'нет')}
        </li>
        <li>
          Интерфейс:
          {badge(plan !== 'free', 'лич. финансы')}
          {badge(plan !== 'free', 'шаблон недели')}
          {badge(plan !== 'free', 'занятия на главной')}
        </li>
        <li>
          Увеличение лимитов по запросу:
          {plan === 'max'
            ? badge(true, 'доступно')
            : (<span title="Чтобы запросить увеличение, перейдите на MAX">{badge(false, 'только в MAX')}</span>)}
        </li>
        {prices && plan!=='beta' && plan!=='free' && (
          <li className="text-muted">{priceLine}</li>
        )}
      </ul>
      <div className="flex flex-wrap gap-2 relative mt-1">
        {/* CTA visibility rules */}
        {/* Онлайн оплата доступна только для платных (не beta/free) */}
        {plan !== 'beta' && plan !== 'free' && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            aria-label="Оплатить онлайн"
            onClick={()=> setOpenOnline(true)}
          >Оплатить онлайн</button>
        )}
        {/* Запросить: скрыть для beta; для free показывать только если текущий план не free */}
        {(plan !== 'beta') && (plan !== 'free' || currentPlan !== 'free') && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            aria-label="Запросить"
            onClick={()=> setOpenMenu(true)}
          >Запросить</button>
        )}
        <button type="button" className="btn btn-ghost btn-xs" onClick={()=>setOpen(true)} title="Что изменится при переходе?">Что изменится?</button>
      </div>

      {plan === 'beta' && (
        <div className="mt-1">
          <span className="badge" title="Активируется автоматически до 15 дней">BETA · до 15 дней</span>
        </div>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setOpen(false)} />
          <div className="relative z-10 w-[92vw] max-w-lg rounded border bg-white p-3 shadow-xl" style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Изменения при переходе на {title}</div>
              <button className="btn btn-xs" onClick={()=>setOpen(false)}>Закрыть</button>
            </div>
            {changes.length === 0 ? (
              <div className="text-sm text-muted">Функциональные различия отсутствуют.</div>
            ) : (
              <ul className="text-sm space-y-1">
                {changes.map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-2">
                    <span>{c.label}</span>
                    <span className="text-muted text-xs">{c.from} → <b>{c.to}</b></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Online not available modal */}
      {openOnline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setOpenOnline(false)} />
          <div className="relative z-10 w-[92vw] max-w-sm rounded border bg-white p-4 shadow-xl" style={{ background: 'var(--card-bg)' }}>
            <div className="font-semibold mb-2">Онлайн‑оплата недоступна</div>
            <div className="text-sm text-muted mb-3">В вашем регионе онлайн‑оплата пока не поддерживается. Вы можете отправить заявку.</div>
            <div className="flex items-center justify-end gap-2">
              <button className="btn btn-outline btn-sm" onClick={()=>setOpenOnline(false)}>Закрыть</button>
              <button className="btn btn-primary btn-sm" onClick={()=>{ setOpenOnline(false); setOpenMenu(true) }}>Запросить</button>
            </div>
          </div>
        </div>
      )}

      {/* Request modal (WhatsApp / Accounting) */}
      {openMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setOpenMenu(false)} />
          <div className="relative z-10 w-[92vw] max-w-sm rounded border bg-white p-4 shadow-xl" style={{ background: 'var(--card-bg)' }}>
            <div className="font-semibold mb-2">Отправить запрос</div>
            <div className="text-sm text-muted mb-3">Укажите срок подписки и выберите способ: WhatsApp — откроется чат и заявка будет зафиксирована у админов; Бухгалтерия — отправим заявку напрямую админам.</div>
            {/* Period selector (для free фиксируем навсегда) */}
            <div className="grid gap-1 mb-3">
              <span className="text-xs text-muted">Срок подписки</span>
              <select className="input !py-2 !px-2" value={period} onChange={e=> setPeriod(e.target.value as any)} disabled={plan==='free'}>
                <option value="month">1 месяц</option>
                <option value="year">1 год</option>
                <option value="forever">навсегда</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={()=> setOpenMenu(false)}>Закрыть</button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-label="Отправить в бухгалтерию"
                onClick={async ()=>{
                  try {
                    await fetch('/api/billing/plan-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: currentPlan, to: plan, period: plan==='free' ? 'forever' : period, channel: 'accounting' }) })
                  } catch {}
                  setOpenMenu(false)
                }}
              >В бухгалтерию</button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                aria-label="Открыть WhatsApp"
                onClick={async ()=>{
                  try {
                    await fetch('/api/billing/plan-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: currentPlan, to: plan, period: plan==='free' ? 'forever' : period, channel: 'whatsapp' }) })
                  } catch {}
                  setOpenMenu(false)
                  const periodText = (plan==='free' ? 'навсегда' : (period==='month' ? '1 месяц' : period==='year' ? '1 год' : 'навсегда'))
                  setTimeout(()=>{ window.open(wa(`Здравствуйте! Хочу сменить тариф на ${title}. Срок: ${periodText}. ${priceLine}. Мой email: ${userEmail}`), '_blank'); }, 50)
                }}
              >WhatsApp</button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky CTA for mobile */}
      <div className="md:hidden sticky bottom-2 mt-2">
        <div className="flex gap-2 rounded-lg border shadow-sm p-2" style={{ background: 'var(--card-bg)' }}>
          {plan !== 'beta' && plan !== 'free' && (
            <button type="button" className="btn btn-outline btn-sm flex-1" onClick={()=> setOpenOnline(true)} aria-label="Оплатить онлайн">Онлайн</button>
          )}
          {(plan !== 'beta') && (plan !== 'free' || currentPlan !== 'free') && (
            <button type="button" className="btn btn-primary btn-sm flex-1" onClick={()=> setOpenMenu(true)} aria-haspopup="dialog">Запросить</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlanCard
