"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, Math.max(2000, intervalMs))
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
