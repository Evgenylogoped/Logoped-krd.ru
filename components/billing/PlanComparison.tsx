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

export default function PlanComparison(props: {
  currentPlan: Plan
  limitsMap: Record<Plan, PlanLimits>
  prices: PricesMap
  phone: string
  userEmail: string
}) {
  const { currentPlan, limitsMap, prices, phone, userEmail } = props
  const [period, setPeriod] = useState<'month'|'year'|'forever'>('month')
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const plans: Plan[] = ['beta','free','pro','pro_plus','max']
  const priceFor = (p: Plan) => {
    if (p==='pro') return prices.pro[period] ?? null
    if (p==='pro_plus') return prices.pro_plus[period] ?? null
    if (p==='max') return prices.max[period] ?? null
    return null
  }
  const priceLabel = (p: Plan) => {
    const v = priceFor(p)
    if (v == null) return '—'
    if (period==='month') return `${v}₽ / мес`
    if (period==='year') return `${v}₽ / год`
    return `${v}₽ / навсегда`
  }
  const title = (p: Plan) => p==='pro_plus' ? 'Pro+' : p.toUpperCase()
  const wa = (s: string) => `https://wa.me/${encodeURIComponent(phone.replace(/[^+0-9]/g,''))}?text=${encodeURIComponent(s)}`

  const features = [
    { key: 'branches', label: 'Филиалы', render: (L: PlanLimits)=> <div className="text-center">{String(L.branches)}</div> },
    { key: 'logopeds', label: 'Логопеды', render: (L: PlanLimits)=> <div className="text-center">{String(L.logopeds)}</div> },
    { key: 'media', label: 'Медиа (MB)', render: (L: PlanLimits)=> <div className="text-center">{String((L as any).mediaMB)}</div> },
    { key: 'support', label: 'Поддержка', render: (L: PlanLimits)=> L.support==='priority' ? <div className="flex items-center justify-center gap-1 text-green-700"><Check/><span>приоритетная</span></div> : <div className="flex items-center justify-center gap-1 text-gray-600"><span>email</span></div> },
    { key: 'chat1', label: 'Чат — личный', render: (L: PlanLimits)=> <div className="flex justify-center">{L.chat.enabled ? <Check/> : <Cross/>}</div> },
    { key: 'chatg', label: 'Чат — групповой', render: (L: PlanLimits)=> <div className="flex justify-center">{L.chat.group ? <Check/> : <Cross/>}</div> },
    { key: 'stats', label: 'Статистика филиалов', render: (L: PlanLimits)=> <div className="flex justify-center">{L.stats.branch ? <Check/> : <Cross/>}</div> },
    { key: 'ux1', label: 'Интерфейс — лич. финансы', render: (_: PlanLimits, p?: Plan)=> <div className="flex justify-center">{(p!=='free') ? <Check/> : <Cross/>}</div> },
    { key: 'ux2', label: 'Интерфейс — шаблон недели', render: (_: PlanLimits, p?: Plan)=> <div className="flex justify-center">{(p!=='free') ? <Check/> : <Cross/>}</div> },
    { key: 'ux3', label: 'Интерфейс — занятия на главной', render: (_: PlanLimits, p?: Plan)=> <div className="flex justify-center">{(p!=='free') ? <Check/> : <Cross/>}</div> },
    { key: 'max_req', label: 'Увеличение лимитов по запросу', render: (_: PlanLimits, p?: Plan)=> p==='max' ? <div className="flex items-center justify-center gap-1 text-green-700"><Check/><span>доступно</span></div> : <div className="flex items-center justify-center" title="Только в MAX"><Cross/></div> },
  ]

  return (
    <div className="hidden md:block rounded-xl border p-3 shadow-sm" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', borderColor: 'rgba(255,255,255,0.4)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Сравнение планов</div>
        <div className="flex items-center gap-1 text-sm" aria-label="Период оплаты">
          <span className="text-xs text-muted mr-1">Период:</span>
          <div className="inline-flex rounded-full border p-0.5 bg-white/70" role="group">
            {(['month','year','forever'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`px-3 py-1 rounded-full text-xs ${period===p? 'text-white' : 'text-gray-700'} ${period===p? 'bg-[var(--brand)]' : ''}`}
                onClick={()=> setPeriod(p)}
              >{p==='month'?'1 мес':p==='year'?'1 год':'навсегда'}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table text-sm min-w-[800px]">
          <thead>
            <tr>
              <th className="w-56"></th>
              {plans.map((p, idx)=> (
                <th key={p} className={`text-center align-bottom transition-colors ${idx>0?'border-l border-gray-100':''} ${hoverCol===idx ? 'bg-green-50' : ''}`} onMouseEnter={()=> setHoverCol(idx)} onMouseLeave={()=> setHoverCol(null)} style={p==='max'?{ background:'rgba(124,58,237,0.06)'}:undefined}>
                  <div className={`px-2 py-2 rounded ${p==='pro_plus' ? 'bg-green-50 ring-1 ring-green-200' : ''}`}>
                    <div className="font-semibold flex items-center justify-center gap-2">
                      <span>{title(p)}</span>
                      {p==='max' && <span className="badge badge-success" title="Можно запросить индивидуальное повышение лимитов">лимиты по запросу</span>}
                    </div>
                    <div className="text-base md:text-lg font-bold">{priceLabel(p)}</div>
                    {p===currentPlan && <div className="badge mt-1">Текущий</div>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f)=> (
              <tr key={f.key}>
                <td className="text-muted">{f.label}</td>
                {plans.map((p, idx)=> {
                  const L = limitsMap[p]
                  return (
                    <td key={p} className={`text-center transition-colors ${idx>0?'border-l border-gray-100':''} ${hoverCol===idx ? 'bg-green-50' : ''}`} style={p==='max'?{ background:'rgba(124,58,237,0.06)'}:undefined}>
                      {f.render(limitsMap[p], p)}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td></td>
              {plans.map((p, idx)=> (
                <td key={p} className={`text-center transition-colors ${idx>0?'border-l border-gray-100':''} ${hoverCol===idx ? 'bg-green-50' : ''}`} style={p==='max'?{ background:'rgba(124,58,237,0.06)'}:undefined}>
                  {p==='beta' ? (
                    <span className="badge">BETA</span>
                  ) : (
                    <div className="flex items-center justify-center gap-2 min-h-[32px] py-1">
                      <a className="btn btn-primary btn-xs" href={wa(`Здравствуйте! Хочу оформить тариф ${title(p)}. Период: ${period}. Цена: ${priceLabel(p)}. Мой email: ${userEmail}`)} target="_blank" rel="noreferrer">Оформить</a>
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
