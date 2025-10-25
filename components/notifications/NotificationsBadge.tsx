"use client"
import React from 'react'

export default function NotificationsBadge({ className }: { className?: string }) {
  const [count, setCount] = React.useState<number>(0)

  React.useEffect(() => {
    let timer: any
    let stopped = false
    async function load() {
      try {
        const r = await fetch('/api/badges', { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          // суммарный actionable-бейдж берём из total
          const total = Number(j.total || 0)
          setCount(total)
        }
      } catch {}
      if (!stopped) timer = setTimeout(load, 15000)
    }
    load()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [])

  if (!count) return null
  return (
    <span className={className || 'ml-2 inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px]'}>
      {count}
    </span>
  )
}
