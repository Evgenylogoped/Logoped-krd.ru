"use client"
import React from 'react'

function b64ToU8(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

async function ensureSubscribed(publicKey: string) {
  if (!('serviceWorker' in navigator)) return false
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return false
    const subNew = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) })
    const body = JSON.stringify({ endpoint: subNew.endpoint, keys: (subNew.toJSON() as any).keys, userAgent: navigator.userAgent, platform: (navigator as any).platform || '' })
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    sub = subNew
  }
  return !!sub
}

export default function SoftAskPush() {
  const [show, setShow] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    const perm = Notification.permission
    if (perm !== 'default') return
    try {
      const key = 'push.softask.nextAt'
      const now = Date.now()
      const nextAt = Number(localStorage.getItem(key) || '0')
      if (now < nextAt) return
      setShow(true)
    } catch {}
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-x-0 bottom-2 z-[1000] px-3 md:px-0 flex justify-center">
      <div className="rounded-xl shadow-lg border bg-white text-gray-900 max-w-md w-full p-3 flex items-center gap-3">
        <div className="flex-1 text-sm">Включите уведомления, чтобы не пропускать сообщения и занятия</div>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const res = await fetch('/api/push/public-key')
              const j = res.ok ? await res.json() : null
              const key = j?.key || ''
              if (!key) return
              const ok = await ensureSubscribed(key)
              if (ok) setShow(false)
            } finally {
              setBusy(false)
            }
          }}
        >Включить</button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => {
            try { localStorage.setItem('push.softask.nextAt', String(Date.now() + 7*24*60*60*1000)) } catch {}
            setShow(false)
          }}
        >Позже</button>
      </div>
    </div>
  )
}
