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
    <span
      className={`inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold select-none ${className||''}`}
      style={{ minWidth: 16, height: 16, padding: '0 5px', lineHeight: '16px' }}
      title={`Требует оценивания: ${count}`}
    >
      {count}
    </span>
  )
}
