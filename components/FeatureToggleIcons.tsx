"use client"
import React, { useEffect, useState } from 'react'

export default function FeatureToggleIcons({ formId, defaultSuper, defaultPrior }: {
  formId: string
  defaultSuper: boolean
  defaultPrior: boolean
}) {
  const [isSuper, setIsSuper] = useState(!!defaultSuper)
  const [isPrior, setIsPrior] = useState(!!defaultPrior)

  useEffect(() => {
    setIsSuper(!!defaultSuper)
    setIsPrior(!!defaultPrior)
  }, [defaultSuper, defaultPrior])

  const applyAndSubmit = (nextSuper: boolean, nextPrior: boolean) => {
    const sel = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"][form="${formId}"]`)
    const fSuper = sel('featuredSuper')
    const fPrior = sel('featured')
    if (fSuper) fSuper.checked = nextSuper
    if (fPrior) fPrior.checked = nextPrior
    setIsSuper(nextSuper)
    setIsPrior(nextPrior)
    const form = document.getElementById(formId) as HTMLFormElement | null
    form?.requestSubmit()
  }

  return (
    <span className="whitespace-nowrap select-none">
      <button
        type="button"
        title="Супер (взаимоисключается)"
        onClick={() => applyAndSubmit(isSuper ? false : true, false)}
        className="cursor-pointer"
        style={{ color: isSuper ? '#ca8a04' : '#d1d5db' }}
      >
        ★
      </button>
      <span className="mx-1"></span>
      <button
        type="button"
        title="Приоритет (взаимоисключается)"
        onClick={() => applyAndSubmit(false, isPrior ? false : true)}
        className="cursor-pointer"
        style={{ color: isPrior ? '#2563eb' : '#d1d5db' }}
        aria-label="Приоритет"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
          <path d="M13 2L3 14h7l-1 8 11-14h-7l0-6z" />
        </svg>
      </button>
    </span>
  )
}
