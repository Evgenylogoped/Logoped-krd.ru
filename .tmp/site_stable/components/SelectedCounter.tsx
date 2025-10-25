"use client"
import React, { useEffect, useState } from 'react'

export default function SelectedCounter({ formId, inputName, label = 'Выбрано' }: { formId: string; inputName: string; label?: string }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    function recalc() {
      const boxes = document.querySelectorAll<HTMLInputElement>(`input[name="${inputName}"][form="${formId}"]`)
      let c = 0
      boxes.forEach(b => { if (b.checked) c++ })
      setCount(c)
    }
    recalc()
    const handler = (e: Event) => {
      const target = e.target as HTMLInputElement
      if (target && target.name === inputName && target.getAttribute('form') === formId) recalc()
    }
    document.addEventListener('change', handler)
    return () => document.removeEventListener('change', handler)
  }, [formId, inputName])
  return (
    <div className="text-sm text-muted">{label}: <span className="font-semibold">{count}</span></div>
  )
}
