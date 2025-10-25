"use client"
import React, { useState } from 'react'

export default function LimitRequestButton(props: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<number>(0)
  const [logopeds, setLogopeds] = useState<number>(0)
  const [mediaMB, setMediaMB] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/billing/limit-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branches, logopeds, mediaMB })
      })
      const j = await r.json().catch(()=>({ ok:false }))
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'Ошибка')
      setDone(true)
      setTimeout(()=>{ setOpen(false); setDone(false) }, 800)
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={()=> setOpen(true)} disabled={props.disabled}>Запросить увеличение лимитов</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=> setOpen(false)} />
          <div className="relative z-10 w-[92vw] max-w-sm rounded border bg-white p-4 shadow-xl" style={{ background: 'var(--card-bg)' }}>
            <div className="font-semibold mb-2">Запрос на увеличение лимитов</div>
            <div className="grid gap-2 mb-3">
              <label className="grid gap-1">
                <span className="text-xs text-muted">Филиалы</span>
                <input type="number" min={0} className="input" value={branches} onChange={e=> setBranches(parseInt(e.target.value||'0',10)||0)} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted">Логопеды</span>
                <input type="number" min={0} className="input" value={logopeds} onChange={e=> setLogopeds(parseInt(e.target.value||'0',10)||0)} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted">Медиа (MB)</span>
                <input type="number" min={0} className="input" value={mediaMB} onChange={e=> setMediaMB(parseInt(e.target.value||'0',10)||0)} />
              </label>
            </div>
            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
            {done && <div className="text-sm text-green-600 mb-2">Отправлено</div>}
            <div className="flex items-center justify-end gap-2">
              <button className="btn btn-outline btn-sm" onClick={()=> setOpen(false)} disabled={loading}>Отмена</button>
              <button className="btn btn-primary btn-sm" onClick={submit} disabled={loading}>{loading?'Отправка…':'Отправить'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
