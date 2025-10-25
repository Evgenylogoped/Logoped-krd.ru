"use client"
import useSWR from 'swr'
import React from 'react'

const fetcher = (url: string) => fetch(url).then(r=>r.json())

export default function OrgBranchesDistribution({ days, extraQuery, refreshIntervalMs }: { days: 7|30|90, extraQuery?: string, refreshIntervalMs?: number }) {
  const q = extraQuery ? `&${extraQuery.replace(/^&+/, '')}` : ''
  const { data, error, isLoading, mutate } = useSWR(`/api/org-stats?scope=company&days=${days}&dist=branches${q}`, fetcher, { revalidateOnFocus: false, refreshInterval: typeof refreshIntervalMs==='number' ? refreshIntervalMs : undefined })
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)
  React.useEffect(()=>{ if (data) setUpdatedAt(new Date()) }, [data])
  if (error) return <div className="text-sm text-amber-700">Ошибка загрузки распределения</div>
  if (isLoading || !data) return <div className="text-sm text-muted">Загрузка…</div>
  const dist = (data.distribution || []) as Array<{ id: string; name: string; lessons: number }>
  const total = dist.reduce((acc, d)=> acc + d.lessons, 0)
  const max = Math.max(1, ...dist.map(d=> d.lessons))

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-xs text-muted mb-2">
        <span className="inline-block w-3 h-3 bg-indigo-500 rounded" />
        <span>Распределение занятий по филиалам</span>
        <span className="ml-auto">Всего: <b>{total}</b></span>
        <span className="text-[11px] text-muted">{updatedAt ? `Обновлено: ${updatedAt.toLocaleTimeString('ru-RU')}` : ''}</span>
        <button className="btn btn-outline btn-xs" onClick={()=>mutate()}>Обновить</button>
        
      </div>
      <div className="space-y-1">
        {dist.length === 0 && <div className="text-sm text-muted">Нет данных</div>}
        {dist.map(d=> (
          <div key={d.id} className="grid grid-cols-[180px_1fr_auto] items-center gap-2 text-sm">
            <div className="truncate" title={d.name}>{d.name}</div>
            <div className="bg-indigo-100 rounded h-3">
              <div className="bg-indigo-500 h-3 rounded" style={{ width: `${Math.max(4, Math.round((d.lessons/max)*100))}%` }} />
            </div>
            <div className="text-right tabular-nums w-10">{d.lessons}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
