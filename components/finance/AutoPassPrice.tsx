"use client"

import React from 'react'

export default function AutoPassPrice({ basePrice, formId }:{ basePrice: number; formId: string }) {
  const [qty, setQty] = React.useState<number>(0)
  const price = Math.max(0, Math.round(Number(basePrice||0)))
  const total = Math.max(0, price * Math.max(0, qty))
  React.useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const hidden = form.querySelector('input[name="totalPrice"]') as HTMLInputElement | null
    if (hidden) hidden.value = String(total)
  }, [formId, total])
  return (
    <div className="grid gap-1">
      <label className="grid gap-1">
        <span className="text-sm text-muted">Количество занятий</span>
        <input
          name="totalLessons"
          type="number"
          min={1}
          placeholder="Занятий"
          className="input"
          onChange={(e)=>setQty(Number(e.target.value||0))}
          required
        />
      </label>
      <div className="text-xs text-muted">
        Цена за занятие: <b>{price.toLocaleString('ru-RU')} ₽</b>. К оплате: <b>{total.toLocaleString('ru-RU')} ₽</b>
      </div>
      <input type="hidden" name="totalPrice" value={total} />
    </div>
  )
}
