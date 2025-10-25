"use client"
import React, { useState } from 'react'

export default function ParentPassword({ value, email }: { value: string | null, email?: string | null }) {
  const [visible, setVisible] = useState(false)
  if (!value) return null
  const masked = '•'.repeat(Math.max(4, value.length))
  const toShow = visible ? value : masked
  const copy = async () => {
    const payload = [email || '', value].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(payload)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: 'Скопировано: email + пароль' }))
      }
    } catch {}
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted">Пароль родителя: </span>
      <span className="font-mono select-all">{toShow}</span>
      <button type="button" className="btn btn-sm" onClick={() => setVisible(v => !v)}>
        {visible ? 'Скрыть' : 'Показать'}
      </button>
      <button type="button" className="btn btn-sm" onClick={copy}>Скопировать</button>
    </div>
  )
}
