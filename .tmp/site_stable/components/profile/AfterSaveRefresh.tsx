"use client"
import { useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

export default function AfterSaveRefresh() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const saved = sp.get('saved') === '1'

  useEffect(() => {
    if (saved) {
      // Сразу обновляем данные и убираем параметр из URL
      router.replace(pathname)
      // Дополнительно принудительный refresh на всякий случай
      router.refresh()
    }
  }, [saved, pathname, router])

  return null
}
