"use client"
import React from 'react'

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    let reg = await navigator.serviceWorker.getRegistration()
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js')
    return reg
  } catch { return null }
}

function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function PushToggle() {
  const [supported, setSupported] = React.useState<boolean>(false)
  const [enabled, setEnabled] = React.useState<boolean>(false)
  const [busy, setBusy] = React.useState<boolean>(false)
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()

  React.useEffect(() => {
    const ok = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(ok)
    ;(async () => {
      if (!ok) return
      const reg = await getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setEnabled(!!sub)
    })()
  }, [])

  async function subscribe() {
    if (!supported || !publicKey) return
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      const reg = await getRegistration()
      if (!reg) return
      const existing = await reg.pushManager.getSubscription()
      if (existing) { setEnabled(true); return }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) })
      const body = JSON.stringify({ endpoint: sub.endpoint, keys: (sub.toJSON() as any).keys, userAgent: navigator.userAgent, platform: (navigator as any).platform || '' })
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      setEnabled(true)
    } finally {
      setBusy(false)
    }
  }

  async function unsubscribe() {
    setBusy(true)
    try {
      const reg = await getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        try { await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint }) }) } catch {}
        await sub.unsubscribe()
      }
      setEnabled(false)
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return (
    <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Пуш‑уведомления не поддерживаются на этом устройстве/браузере.</div>
  )

  return (
    <div className="flex items-center gap-3">
      <button disabled={busy || enabled || !publicKey} className="btn btn-primary btn-sm" onClick={subscribe}>Включить push‑уведомления</button>
      <button disabled={busy || !enabled} className="btn btn-outline btn-sm" onClick={unsubscribe}>Отключить</button>
      {!publicKey && <span className="text-xs text-muted">Ключ браузера не настроен</span>}
    </div>
  )
}
