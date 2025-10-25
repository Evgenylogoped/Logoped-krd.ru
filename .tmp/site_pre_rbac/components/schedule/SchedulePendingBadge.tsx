"use client"
import React from "react"

export default function SchedulePendingBadge({ className }: { className?: string }) {
  const [count, setCount] = React.useState<number>(0)
  React.useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const res = await fetch('/api/schedule/pending-count', { cache: 'no-store' })
        if (!ignore && res.ok) {
          const j = await res.json()
          setCount(Number(j?.count || 0))
        }
      } catch {}
    }
    load()
    const id = setInterval(load, 60000)
    return () => { ignore = true; clearInterval(id) }
  }, [])
  if (!count) return null
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-[2px] text-[10px] font-semibold select-none ${className||''}`}
      style={{ background: 'var(--brand-ghost, rgba(239,68,68,.1))', color: 'var(--brand, #ef4444)', border: '1px solid currentColor' }}
      title={`Требует оценивания: ${count}`}
    >
      {count}
    </span>
  )
}
