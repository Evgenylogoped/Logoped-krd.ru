"use client"

import React from 'react'

export default function ConfirmButton({ formId, text, className, confirmMessage }: { formId: string; text: string; className?: string; confirmMessage: string }) {
  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (confirm(confirmMessage)) {
      const form = document.getElementById(formId) as HTMLFormElement | null
      if (form) form.submit()
    }
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {text}
    </button>
  )
}
