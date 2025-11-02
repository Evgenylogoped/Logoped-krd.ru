"use client"
import React from 'react'

export default function AdminBroadcastV2() {
  const [title, setTitle] = React.useState('Инфо')
  const [body, setBody] = React.useState('Тестовое админ‑сообщение')
  const [url, setUrl] = React.useState('/')
  const [role, setRole] = React.useState('')
  const [city, setCity] = React.useState('')
  const [q, setQ] = React.useState('')
  const [sendAll, setSendAll] = React.useState(false)
  const [found, setFound] = React.useState<{ id: string; name?: string; email?: string; phone?: string }[]>([])
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [res, setRes] = React.useState<string>('')

  React.useEffect(() => {
    try {
      const usp = new URLSearchParams(window.location.search)
      const ids = usp.get('ids')
      if (ids) setSelectedIds(ids.split(',').map(s=>s.trim()).filter(Boolean))
    } catch {}
  }, [])

  React.useEffect(() => {
    let t: any
    if (!sendAll) {
      t = setTimeout(async () => {
        try {
          const p = new URLSearchParams()
          if (q) p.set('q', q)
          if (role) p.set('role', role)
          if (city) p.set('city', city)
          const r = await fetch('/api/admin/users/search?' + p.toString(), { cache: 'no-store' })
          const j = await r.json().catch(()=>null)
          if (Array.isArray(j?.items)) setFound(j.items)
          else setFound([])
        } catch { setFound([]) }
      }, 300)
    } else {
      setFound([])
    }
    return () => clearTimeout(t)
  }, [q, role, city, sendAll])

  async function send() {
    setBusy(true)
    setRes('')
    try {
      const payload: any = { title: title.trim(), body: body.trim(), url: url.trim() || '/' }
      const segment: any = {}
      if (!sendAll && selectedIds.length) segment.userIds = selectedIds
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
      else setRes(j?.error || 'Ошибка отправки')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded border p-3 space-y-2" style={{ background: 'var(--card-bg)' }}>
      <div className="font-semibold">Админ‑рассылка (Web Push) · V2</div>
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
      <div className="grid gap-2">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="checkbox" checked={sendAll} onChange={e=>setSendAll(e.target.checked)} />
          <span>Отправить всем (игнорировать поиск и выбранных)</span>
        </label>
        {!sendAll && (
          <div className="grid gap-2">
            <div className="grid md:grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-sm">Поиск пользователей (имя/email/телефон)</span>
                <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Начните вводить..." />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Выбрано</span>
                <div className="min-h-[38px] p-2 border rounded text-sm bg-white/50">
                  {selectedIds.length ? selectedIds.join(', ') : '—'}
                </div>
              </label>
            </div>
            <div className="grid gap-1">
              <span className="text-sm">Результаты поиска</span>
              <div className="max-h-56 overflow-auto border rounded divide-y bg-white">
                {found.length === 0 && <div className="p-2 text-sm text-muted">Нет результатов</div>}
                {found.map(u => (
                  <label key={u.id} className="flex items-center gap-2 p-2">
                    <input type="checkbox" className="checkbox" checked={selectedIds.includes(u.id)} onChange={e=>{
                      setSelectedIds(prev => e.target.checked ? [...new Set([...prev, u.id])] : prev.filter(x=>x!==u.id))
                    }} />
                    <div className="text-sm">
                      <div className="font-medium">{u.name || u.email || u.phone || u.id}</div>
                      <div className="text-xs text-muted">{u.email || ''} {u.phone ? ` · ${u.phone}` : ''}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
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
