"use client"
import React from 'react'

export default function ConfirmButton({
  children,
  message = 'Вы уверены?',
  className,
  disabled,
  title,
  clickSelector,
}: {
  children: React.ReactNode
  message?: string
  className?: string
  disabled?: boolean
  title?: string
  clickSelector?: string
}) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        if (!window.confirm(message)) return
        const form = (e.currentTarget as HTMLButtonElement).closest('form')
        if (!form) return
        if (clickSelector) {
          const el = form.querySelector<HTMLButtonElement>(clickSelector)
          if (el) { el.click(); return }
        }
        form.requestSubmit()
      }}
    >
      {children}
    </button>
  )
}
