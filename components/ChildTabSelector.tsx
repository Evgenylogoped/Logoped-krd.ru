"use client"
import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ChildTabSelector({ childId, current }: { childId: string, current: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(sp?.toString() || '')
    params.set('tab', e.target.value)
    router.push(`/logoped/child/${childId}?` + params.toString())
  }
  return (
    <div className="sm:hidden mt-2">
      <label className="text-xs text-muted block mb-1">Раздел</label>
      <select className="input !py-2 !px-2 w-full" value={current} onChange={onChange}>
        <option value="main">Основное</option>
        <option value="parent">Родитель</option>
        <option value="history">История</option>
        <option value="materials">Материалы и ДЗ</option>
        <option value="progress">Прогресс</option>
      </select>
    </div>
  )
}
