"use client"
import { useEffect, useState } from 'react'

export default function ClampHints() {
  const [hint, setHint] = useState<string>("")

  useEffect(() => {
    try {
      const getCookie = (name: string) => {
        const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
        return m ? decodeURIComponent(m[1]) : ''
      }
      const fields = (getCookie('admin_clamp_fields') || '').split(',').filter(Boolean)
      const hintText = getCookie('admin_clamp_hint') || ''
      if (fields.length) {
        fields.forEach((name) => {
          const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)
          if (el) {
            el.classList.add('ring-2', 'ring-yellow-400', 'bg-yellow-50')
          }
        })
      }
      if (hintText) setHint(hintText)
      // clear cookies after applying to avoid sticking on next navigations
      document.cookie = 'admin_clamp_fields=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      document.cookie = 'admin_clamp_hint=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      // auto hide toast after 5s
      const t = setTimeout(() => setHint(''), 5000)
      return () => clearTimeout(t)
    } catch {}
  }, [])

  if (!hint) return null

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="rounded-lg border shadow-md px-3 py-2 text-sm bg-yellow-50 border-yellow-200 text-yellow-900 flex items-start gap-3">
        <div>
          <div className="font-medium mb-0.5">Обратите внимание</div>
          <div>{hint}</div>
        </div>
        <button
          type="button"
          className="ml-auto text-xs px-2 py-1 rounded border border-yellow-300 hover:bg-yellow-100"
          onClick={() => {
            setHint('')
            document.cookie = 'admin_clamp_fields=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
            document.cookie = 'admin_clamp_hint=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
          }}
          aria-label="Скрыть"
        >
          Скрыть
        </button>
      </div>
    </div>
  )
}
