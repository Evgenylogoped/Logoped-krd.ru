"use client"
import { useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

export default function AfterSaveRefresh() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const saved = false

  useEffect(() => {
    
  }, [saved, pathname, router])

  return null
}
