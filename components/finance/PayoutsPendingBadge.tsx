"use client"
import React from "react"

export default function PayoutsPendingBadge({ className, max = 99 }: { className?: string; max?: number }) {
  const [count, setCount] = React.useState<number>(0)
  React.useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const res = await fetch('/api/payouts/pending-count', { cache: 'no-store' })
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
  const text = count > max ? `${max}+` : String(count)
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold select-none ${className||''}`}
      style={{ minWidth: 16, height: 16, padding: '0 5px', lineHeight: '16px' }}
      title={`Заявок на выплату: ${count}`}
    >
      {text}
    </span>
  )
}
