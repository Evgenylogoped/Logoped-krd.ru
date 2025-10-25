"use client"
import React from "react"

export default function LogopedOrgFinanceBadge({ className }: { className?: string }) {
  const [pending, setPending] = React.useState<number>(0)
  const [lastConfirmedAt, setLastConfirmedAt] = React.useState<string | null>(null)
  const [showGreen, setShowGreen] = React.useState(false)

  React.useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const res = await fetch('/api/payouts/my-status', { cache: 'no-store' })
        if (!ignore && res.ok) {
          const j = await res.json()
          const p = Number(j?.pending || 0)
          setPending(p)
          const lc = j?.lastConfirmedAt as string | null
          setLastConfirmedAt(lc)
          if (p === 0 && lc) {
            try {
              const seenRaw = localStorage.getItem('orgfin.lastSeenAt')
              const seen = seenRaw ? new Date(seenRaw).getTime() : 0
              const last = new Date(lc).getTime()
              setShowGreen(last > seen)
            } catch {}
          } else {
            setShowGreen(false)
          }
        }
      } catch {}
    }
    load()
    const id = setInterval(load, 60000)
    return () => { ignore = true; clearInterval(id) }
  }, [])

  if (pending > 0) {
    return (
      <span className={`inline-flex rounded-full bg-red-600 w-3 h-3 ${className||''}`} title="Есть неподтверждённый запрос на выплату" />
    )
  }
  if (showGreen) {
    return (
      <span className={`inline-flex rounded-full bg-emerald-600 w-3 h-3 ${className||''}`} title="Выплата подтверждена" />
    )
  }
  return null
}
