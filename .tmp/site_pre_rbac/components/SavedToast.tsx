"use client"
import { useEffect } from 'react'

export default function SavedToast({ message = "Сохранено" }: { message?: string }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: message }))
    }
  }, [message])
  return null
}
