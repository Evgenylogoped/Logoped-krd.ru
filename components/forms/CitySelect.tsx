"use client"

import React from 'react'
import { RU_CITIES } from '@/lib/cities'

export default function CitySelect({ name, defaultValue, required }: { name: string; defaultValue?: string | null; required?: boolean }) {
  const [value, setValue] = React.useState<string>(defaultValue || '')
  // Держим список отсортированным для удобства
  const options = React.useMemo(() => {
    const set = new Set<string>(RU_CITIES.filter(Boolean))
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [])
  React.useEffect(() => { if (defaultValue) setValue(defaultValue) }, [defaultValue])
  return (
    <select
      name={name}
      className="input"
      required={required}
      value={value || ''}
      onChange={(e) => setValue(e.target.value)}
    >
      <option value="" disabled>{required ? 'Выберите город' : '— Без города —'}</option>
      {options.map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  )
}
