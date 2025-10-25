"use client"
import React from "react"
import { useFormStatus } from "react-dom"

export default function SubmitButton({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus()
  return (
    <button className={className || "btn btn-primary"} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Сохранение…" : (children || "Сохранить")}
    </button>
  )
}
