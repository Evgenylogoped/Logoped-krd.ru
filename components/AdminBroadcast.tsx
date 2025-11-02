"use client"
import React from 'react'

export default function AdminBroadcast() {
  const [title, setTitle] = React.useState('Инфо')
  const [body, setBody] = React.useState('Тестовое админ‑сообщение')
  const [url, setUrl] = React.useState('/')
  const [role, setRole] = React.useState('')
  const [city, setCity] = React.useState('')
  const [recipients, setRecipients] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [res, setRes] = React.useState<string>('')

  React.useEffect(() => {
    try {
      const usp = new URLSearchParams(window.location.search)
      const ids = usp.get('ids')
      if (ids && !recipients.trim()) setRecipients(ids.split(',').join('\n'))
    } catch {}
  }, [])

  async function send() {
    setBusy(true)
    setRes('')
    try {
      const payload: any = { title: title.trim(), body: body.trim(), url: url.trim() || '/' }
      const segment: any = {}
      // explicit recipients: parse by lines, accept ids or emails (server expects userIds; emails ignored unless server resolves)
      const raw = recipients.trim()
      if (raw) {
        const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
        // Only pass as userIds; server filters existence
        segment.userIds = lines
      }
      if (role) segment.role = role
      if (city) segment.city = city.trim()
      if (Object.keys(segment).length) payload.segment = segment
      const r = await fetch('/api/push/admin-broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const j = await r.json().catch(()=>null)
      if (r.ok) setRes(`Отправлено в очередь: ${j?.enqueued ?? '?'} пользователей`)
      else setRes(`Ошибка: ${j?.error || r.status}`)
    } catch (e) {
      setRes(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded border p-3 space-y-2" style={{ background: 'var(--card-bg)' }}>
      <div className="font-semibold">Админ‑рассылка (Web Push)</div>
      <div className="grid md:grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-sm">Заголовок</span>
          <input className="input" value={title} onChange={e=>setTitle(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">URL (по клику)</span>
          <input className="input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="/" />
        </label>
      </div>
      <label className="grid gap-1">
        <span className="text-sm">Текст</span>
        <textarea className="textarea" value={body} onChange={e=>setBody(e.target.value)} rows={3} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm">Получатели (ID по одному на строку) — необязательно</span>
        <textarea className="textarea" value={recipients} onChange={e=>setRecipients(e.target.value)} rows={3} placeholder="userId1\nuserId2" />
        <span className="text-xs text-muted">Если указаны — отправка только этим пользователям. Иначе используются фильтры ниже или все пользователи с активной подпиской.</span>
      </label>
      <div className="grid md:grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-sm">Фильтр по роли (необязательно)</span>
          <select className="input" value={role} onChange={e=>setRole(e.target.value)}>
            <option value="">— все роли —</option>
            <option value="LOGOPED">LOGOPED</option>
            <option value="PARENT">PARENT</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="ACCOUNTANT">ACCOUNTANT</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Фильтр по городу (необязательно)</span>
          <input className="input" value={city} onChange={e=>setCity(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn btn-secondary" disabled={busy || !title.trim() || !body.trim()} onClick={send}>Отправить</button>
        <div className="text-xs text-muted">Отправляется только тем пользователям, у кого есть активные подписки</div>
      </div>
      {res && <div className="text-sm">{res}</div>}
    </div>
  )
}
