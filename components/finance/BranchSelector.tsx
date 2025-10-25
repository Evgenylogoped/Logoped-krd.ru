"use client"

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export type BranchOption = { id: string; name: string }

export default function BranchSelector({ branches, allLabel = 'Все филиалы', param = 'branch' }: { branches: BranchOption[]; allLabel?: string; param?: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const value = sp.get(param) || ''
  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    const next = new URL(window.location.href)
    if (v) next.searchParams.set(param, v); else next.searchParams.delete(param)
    router.push(next.toString())
  }
  return (
    <select className="input default-select !py-1 !px-2" value={value} onChange={onChange}>
      <option value="">{allLabel}</option>
      {branches.map(b => (
        <option key={b.id} value={b.id}>{b.name || b.id}</option>
      ))}
    </select>
  )
}
