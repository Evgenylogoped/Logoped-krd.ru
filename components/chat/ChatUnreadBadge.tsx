"use client"
import React from 'react'

export default function ChatUnreadBadge({ className }: { className?: string }) {
  const [count, setCount] = React.useState<number>(0)

  React.useEffect(() => {
    let es: EventSource | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    function startPolling(interval = 15000) {
      async function load() {
        try {
          const res = await fetch('/api/chat/unread', { cache: 'no-store' })
          const json = await res.json()
          setCount(Number(json?.unread || 0))
        } catch {}
      }
      load()
      pollTimer = setInterval(load, interval)
    }
    try {
      es = new EventSource('/api/chat/unread/stream')
      es.addEventListener('unread', (e: MessageEvent) => {
        try {
          const data = JSON.parse((e as MessageEvent).data || '{}')
          setCount(Number(data?.unread || 0))
        } catch {}
      })
      es.onerror = () => {
        if (es) { es.close(); es = null }
        if (!pollTimer) startPolling(12000)
      }
    } catch {
      startPolling(15000)
    }
    return () => {
      if (es) es.close()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [])

  if (!count) return null
  return (
    <span className={className || 'ml-2 inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px]'}>
      {count}
    </span>
  )
}
