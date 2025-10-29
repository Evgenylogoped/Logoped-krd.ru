"use client"
import React from 'react'

export default function ChatUnreadBadge({ className }: { className?: string }) {
  const [count, setCount] = React.useState<number>(0)

  React.useEffect(() => {
    let es: EventSource | null = null
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    async function load() {
      try {
        const res = await fetch('/api/chat/unread', { cache: 'no-store' })
        const json = await res.json()
        setCount(Number(json?.unread || 0))
      } catch {}
    }
    // Экспоненциальный бэкофф для резервного опроса при падении SSE
    let backoffMs = 15000
    const maxBackoffMs = 120000
    const schedulePoll = () => {
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = setTimeout(async () => {
        await load()
        backoffMs = Math.min(maxBackoffMs, Math.round(backoffMs * 1.7))
        schedulePoll()
      }, backoffMs)
    }

    // Мгновенно получаем текущее значение
    load()

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
        // запускаем резервный опрос с бэкофом
        schedulePoll()
      }
    } catch {}
    // Обновляем при возврате фокуса/видимости
    const onFocus = () => { load() }
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (es) es.close()
      if (pollTimer) clearTimeout(pollTimer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (!count) return null
  return (
    <span className={className || 'ml-2 inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px]'}>
      {count}
    </span>
  )
}
