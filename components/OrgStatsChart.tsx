"use client"
import useSWR from 'swr'
import React from 'react'

const fetcher = (url: string) => fetch(url).then(r=>r.json())

export default function OrgStatsChart({ scope, days, extraQuery, refreshIntervalMs }: { scope: 'company' | 'branch' | 'global', days: 7|30|90, extraQuery?: string, refreshIntervalMs?: number }) {
  const q = extraQuery ? `&${extraQuery.replace(/^&+/, '')}` : ''
  const { data, error, isLoading, mutate } = useSWR(`/api/org-stats?scope=${scope}&days=${days}${q}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: (typeof refreshIntervalMs==='number' && refreshIntervalMs>0) ? refreshIntervalMs : undefined }
  )
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)
  React.useEffect(()=>{ if (data) setUpdatedAt(new Date()) }, [data])
  if (error) return <div className="text-sm text-amber-700">Ошибка загрузки статистики</div>
  if (isLoading || !data) return <div className="text-sm text-muted">Загрузка…</div>
  const buckets = data.buckets as Record<string, number>
  const labels = Object.keys(buckets).sort()
  const values = labels.map(k => buckets[k])
  const max = Math.max(1, ...values)
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  const exportCsv = () => {
    const rows = [['date','count'], ...labels.map((l,i)=> [new Date(l).toISOString(), String(values[i])])]
    const csv = rows.map(r=> r.map(x=>`"${(x||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stats_${scope}_${days}d.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-xs text-muted mb-1">
        <span className="inline-block w-3 h-3 bg-blue-500 rounded" />
        <span>Занятия/день</span>
        <span className="ml-auto text-[11px] text-muted">{updatedAt ? `Обновлено: ${updatedAt.toLocaleTimeString('ru-RU')}` : ''}</span>
        <button className="btn btn-outline btn-xs" onClick={()=>mutate()}>Обновить</button>
        
      </div>
      <div className="relative">
        <div className="grid gap-1 grid-cols-12 h-28 items-end">
          {values.map((v, i) => {
            const h = Math.round((v / max) * 100)
            return (
              <div key={i} className="flex flex-col items-center gap-1"
                   onMouseEnter={()=>setHoverIdx(i)} onMouseLeave={()=>setHoverIdx(null)}>
                <div className={`w-4 rounded ${hoverIdx===i?'bg-blue-600':'bg-blue-500'}`} style={{ height: `${Math.max(6, h)}%` }} />
                <div className="text-[10px] text-muted">{fmt(labels[i])}</div>
              </div>
            )
          })}
        </div>
        {hoverIdx!==null && (
          <div className="absolute -top-2 left-0 w-full flex justify-center pointer-events-none">
            <div className="rounded border bg-white shadow px-2 py-1 text-[11px] text-gray-800">
              {fmt(labels[hoverIdx])}: <b>{values[hoverIdx]}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
