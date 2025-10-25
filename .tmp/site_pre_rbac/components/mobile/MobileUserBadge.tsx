"use client"
import React from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

function formatSurnameInitials(name?: string | null, email?: string | null) {
  const n = (name || '').trim()
  if (!n) return email || ''
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  const surname = parts[0]
  const initials = parts.slice(1).map(p => (p && p[0] ? (p[0].toUpperCase() + '.') : '')).join('')
  return `${surname} ${initials}`.trim()
}

export default function MobileUserBadge() {
  const { data } = useSession()
  const user = (data?.user as any) || null
  const text = formatSurnameInitials(user?.name, user?.email)
  if (!text) return null
  return (
    <Link href="/" className="inline-flex items-center gap-2 px-2 py-1 rounded-full border bg-gray-50 text-gray-800 text-xs max-w-[200px]" title={user?.name || user?.email}>
      {user?.image ? (
        <img src={user.image} alt={user?.name || user?.email || 'avatar'} className="w-6 h-6 rounded-full object-cover" />
      ) : (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-semibold">
          {(user?.name || user?.email || '?').split(/\s+/).filter(Boolean).slice(0,2).map((p:string)=>p[0]?.toUpperCase()).join('') || '?'}
        </span>
      )}
      <span className="truncate">{text}</span>
    </Link>
  )
}
