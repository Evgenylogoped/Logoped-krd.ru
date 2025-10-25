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

type PricesMap = {
  pro: { month: number; year: number; forever?: number | null }
  pro_plus: { month: number; year: number; forever?: number | null }
  max: { month: number; year: number; forever?: number | null }
}

const Check = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" className="w-4 h-4 text-green-600" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
)
const Cross = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" className="w-4 h-4 text-red-600" fill="currentColor"><path fillRule="evenodd" d="M10 8.586l3.536-3.536a1 1 0 111.414 1.414L11.414 10l3.536 3.536a1 1 0 01-1.414 1.414L10 11.414l-3.536 3.536a1 1 0 01-1.414-1.414L8.586 10 5.05 6.464A1 1 0 116.464 5.05L10 8.586z" clipRule="evenodd"/></svg>
)

export default function PlanCompareMobile(props: {
  currentPlan: Plan
  limitsMap: Record<Plan, PlanLimits>
  prices: PricesMap
  phone: string
  userEmail: string
}) {
  const { currentPlan, limitsMap, prices, phone, userEmail } = props
  const [target, setTarget] = useState<Plan>('pro')
  const title = (p: Plan) => p==='pro_plus' ? 'Pro+' : p.toUpperCase()
  const wa = (s: string) => `https://wa.me/${encodeURIComponent(phone.replace(/[^+0-9]/g,''))}?text=${encodeURIComponent(s)}`
  const priceOf = (p: Plan) => (p==='pro'?prices.pro.month:(p==='pro_plus'?prices.pro_plus.month:(p==='max'?prices.max.month:null)))

  const features = [
    { key: 'branches', label: 'Филиалы', render: (L: PlanLimits)=> <div className="text-center">{String(L.branches)}</div> },
    { key: 'logopeds', label: 'Логопеды', render: (L: PlanLimits)=> <div className="text-center">{String(L.logopeds)}</div> },
    { key: 'mediaMB', label: 'Медиа (MB)', render: (L: PlanLimits)=> <div className="text-center">{String((L as any).mediaMB)}</div> },
    { key: 'support', label: 'Поддержка', render: (L: PlanLimits)=> (L.support==='priority') ? <div className="flex items-center justify-center gap-1 text-green-700"><Check/><span>приоритетная</span></div> : <span className="text-gray-600">email</span> },
    { key: 'chat1', label: 'Чат — личный', render: (L: PlanLimits)=> <div className="flex justify-center"><span className="inline-flex">{L.chat.enabled ? <Check/> : <Cross/>}</span></div> },
    { key: 'chatg', label: 'Чат — групповой', render: (L: PlanLimits)=> <div className="flex justify-center"><span className="inline-flex">{L.chat.group ? <Check/> : <Cross/>}</span></div> },
    { key: 'stats', label: 'Статистика филиалов', render: (L: PlanLimits)=> <div className="flex justify-center"><span className="inline-flex">{L.stats.branch ? <Check/> : <Cross/>}</span></div> },
    { key: 'ux1', label: 'Интерфейс — лич. финансы', render: (_: PlanLimits, p?: Plan)=> <div className="flex justify-center"><span className="inline-flex">{(p!=='free') ? <Check/> : <Cross/>}</span></div> },
    { key: 'ux2', label: 'Интерфейс — шаблон недели', render: (_: PlanLimits, p?: Plan)=> <div className="flex justify-center"><span className="inline-flex">{(p!=='free') ? <Check/> : <Cross/>}</span></div> },
    { key: 'ux3', label: 'Интерфейс — занятия на главной', render: (_: PlanLimits, p?: Plan)=> <div className="flex justify-center"><span className="inline-flex">{(p!=='free') ? <Check/> : <Cross/>}</span></div> },
    { key: 'max_req', label: 'Лимиты по запросу', render: (_: PlanLimits, p?: Plan)=> <div className="flex justify-center"><span className="inline-flex" title={p==='max'? 'доступно' : 'только в MAX'}>{p==='max'? <Check/> : <Cross/>}</span></div> },
  ]

  // Сравнение для подсветки улучшений/ухудшений
  const diff = (key: string): -1|0|1 => {
    if (key==='branches' || key==='logopeds' || key==='mediaMB') {
      const a = (cur as any)[key]
      const b = (trg as any)[key]
      return b===a ? 0 : (b>a ? 1 : -1)
    }
    if (key==='support') {
      const v = (x: PlanLimits) => x.support==='priority' ? 1 : 0
      return v(trg)===v(cur) ? 0 : (v(trg)>v(cur) ? 1 : -1)
    }
    if (key==='chat1') {
      const v = (x: PlanLimits) => x.chat.enabled ? 1 : 0
      return v(trg)===v(cur) ? 0 : (v(trg)>v(cur) ? 1 : -1)
    }
    if (key==='chatg') {
      const v = (x: PlanLimits) => x.chat.group ? 1 : 0
      return v(trg)===v(cur) ? 0 : (v(trg)>v(cur) ? 1 : -1)
    }
    if (key==='stats') {
      const v = (x: PlanLimits) => x.stats.branch ? 1 : 0
      return v(trg)===v(cur) ? 0 : (v(trg)>v(cur) ? 1 : -1)
    }
    if (key.startsWith('ux')) {
      const v = (p?: Plan) => (p!=='free') ? 1 : 0
      return v(target)===v(currentPlan) ? 0 : (v(target)>v(currentPlan) ? 1 : -1)
    }
    if (key==='max_req') {
      const v = (p?: Plan) => (p==='max') ? 1 : 0
      return v(target)===v(currentPlan) ? 0 : (v(target)>v(currentPlan) ? 1 : -1)
    }
    return 0
  }

  const cur = limitsMap[currentPlan]
  const trg = limitsMap[target]

  return (
    <div className="md:hidden rounded-2xl border shadow-sm space-y-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderColor: 'rgba(255,255,255,0.4)' }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(236,72,153,0.18) 100%)' }}>
        <div className="text-sm font-semibold">Сравнение с планом</div>
        <select className="select select-bordered select-sm" value={target} onChange={(e)=> setTarget(e.target.value as Plan)}>
          {(['beta','free','pro','pro_plus','max'] as Plan[]).map(p=> (
            <option key={p} value={p}>{title(p)}</option>
          ))}
        </select>
      </div>
      <div className="px-3 grid grid-cols-[1fr_1fr] gap-3 text-[11px] text-muted">
        <div className="col-start-1 col-end-2 text-center"><span className="badge">Текущий: {title(currentPlan)}</span></div>
        <div className="col-start-2 col-end-3 text-center"><span className="badge badge-success">Сравнить: {title(target)}</span></div>
      </div>
      <ul className="divide-y text-sm">
        {features.map(f=> (
          <li key={f.key} className="py-2 flex items-center justify-between gap-3">
            <div className="text-muted text-xs w-1/2">{f.label}</div>
            <div className="grid grid-cols-2 place-items-center w-1/2">
              <div className="min-w-[56px] text-center flex justify-center">{f.key.startsWith('ux') || f.key==='max_req' ? f.render(cur, currentPlan) : f.render(cur)}</div>
              <div className={`min-w-[56px] text-center flex justify-center rounded ${diff(f.key)>0 ? 'bg-green-50' : diff(f.key)<0 ? 'bg-rose-50' : ''}`}>{f.key.startsWith('ux') || f.key==='max_req' ? f.render(trg, target) : f.render(trg)}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-3 pb-3 flex items-center justify-between gap-2">
        <div className="text-xs text-muted">Цена: {priceOf(target) ? `${priceOf(target)}₽/мес` : '—'}</div>
        {target==='beta' ? (
          <div className="text-xs text-muted">Бета активируется автоматически</div>
        ) : (
          <a className="btn btn-primary btn-sm" href={wa(`Здравствуйте! Хочу оформить тариф ${title(target)}. Период: 1 месяц. Мой email: ${userEmail}`)} target="_blank" rel="noreferrer">Оформить</a>
        )}
      </div>
    </div>
  )
}
