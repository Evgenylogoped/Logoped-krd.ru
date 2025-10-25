"use client"
import React from 'react'

export default function SelectAll({
  formId,
  inputName,
  label = 'Выделить все',
}: {
  formId: string
  inputName: string
  label?: string
}) {
  function onToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const boxes = document.querySelectorAll<HTMLInputElement>(`input[name="${inputName}"][form="${formId}"]`)
    boxes.forEach(b => { b.checked = e.target.checked })
  }
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" onChange={onToggle} /> {label}
    </label>
  )
}
