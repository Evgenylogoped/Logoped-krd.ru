"use client"
import React from 'react'

type U = { id: string; name?: string; email?: string; phone?: string }
export default function AdminBroadcastV2({ initialUsers = [] as U[] }: { initialUsers?: U[] }) {
  const [title, setTitle] = React.useState('Инфо')
  const [body, setBody] = React.useState('Тестовое админ‑сообщение')
  const [url, setUrl] = React.useState('/')
  const [role, setRole] = React.useState('')
  const [city, setCity] = React.useState('')
  const [q, setQ] = React.useState('')
  const [sendAll, setSendAll] = React.useState(false)
  const [found, setFound] = React.useState<U[]>(initialUsers)
  const [err, setErr] = React.useState<string>('')
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
          setErr('')
          const p = new URLSearchParams()
          if (q) p.set('q', q)
          if (role) p.set('role', role)
          if (city) p.set('city', city)
          const r = await fetch('/api/admin/users/search?' + p.toString(), { cache: 'no-store', credentials: 'include' })
          if (!r.ok) {
            setErr('Ошибка поиска: ' + r.status)
            setFound(initialUsers)
            return
          }
          const j = await r.json().catch(()=>null)
          if (Array.isArray(j?.items)) setFound(j.items as U[])
          else setFound(initialUsers)
        } catch {
          setErr('Ошибка сети при поиске')
          setFound(initialUsers)
        }
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
        body: JSON.stringify(payload),
        credentials: 'include'
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">Результаты ({found.length}) · Выбрано: {selectedIds.length}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-xs" onClick={()=>setSelectedIds(prev=>Array.from(new Set([...prev, ...found.map(u=>u.id)])))}>Выбрать все в выдаче</button>
                  <button type="button" className="btn btn-xs" onClick={()=>setSelectedIds([])}>Снять выбор</button>
                </div>
              </div>
              <div className="max-h-56 overflow-auto border rounded divide-y bg-white">
                {err && <div className="p-2 text-xs text-red-600">{err}</div>}
                {found.length === 0 && !err && <div className="p-2 text-sm text-muted">Нет результатов</div>}
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
