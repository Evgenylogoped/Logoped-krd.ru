"use client"
import React, { useEffect, useState } from 'react'

export default function FeatureSaveButton({ formId, defaultFeatured, defaultFeaturedSuper }: {
  formId: string
  defaultFeatured: boolean
  defaultFeaturedSuper: boolean
}) {
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    const sel = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"][form="${formId}"]`)
    const f = sel('featured')
    const fs = sel('featuredSuper')
    const recalc = () => {
      const curF = !!sel('featured')?.checked
      const curFS = !!sel('featuredSuper')?.checked
      setChanged(curF !== defaultFeatured || curFS !== defaultFeaturedSuper)
    }
    recalc()
    const onChange = (e: Event) => {
      const target = e.target as HTMLInputElement
      if (!target || target.type !== 'checkbox') return
      // реагируем только на чекбоксы, принадлежащие этой форме
      const targetForm = target.getAttribute('form')
      if (targetForm !== formId) return
      if (target.name === 'featured' && target.checked) {
        const other = sel('featuredSuper')
        if (other) other.checked = false
      } else if (target.name === 'featuredSuper' && target.checked) {
        const other = sel('featured')
        if (other) other.checked = false
      }
      recalc()
    }
    document.addEventListener('change', onChange)
    return () => document.removeEventListener('change', onChange)
  }, [formId, defaultFeatured, defaultFeaturedSuper])

  return (
    <button className={`btn btn-sm ${changed ? 'btn-secondary' : ''}`}>
      {changed ? 'Изменить' : 'Сохранить'}
    </button>
  )
}
