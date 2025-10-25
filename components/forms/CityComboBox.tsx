"use client"

import React from 'react'
import { RU_CITIES } from '@/lib/cities'

// Комбобокс города с автопоиском. Разрешает только значения из списка RU_CITIES.
// Поведение:
// - Ввод фильтрует выпадающий список
// - Стрелки ↑/↓ перемещают выделение, Enter — выбрать, Esc — закрыть
// - Blur: если значение не из списка — очищаем
// - Отправляет выбранное значение через скрытый <input name={name}>
export default function CityComboBox({ name, defaultValue, required }: { name: string; defaultValue?: string | null; required?: boolean }) {
  const sorted = React.useMemo(() => Array.from(new Set(RU_CITIES)).sort((a,b)=>a.localeCompare(b,'ru')), [])
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState<string>(defaultValue || '')
  const [highlight, setHighlight] = React.useState<number>(-1)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const filtered = React.useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return sorted.slice(0, 50)
    const arr = sorted.filter(c => c.toLowerCase().includes(q))
    return arr.slice(0, 50)
  }, [query, sorted])

  const isValid = React.useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    return !!sorted.find(c => c.toLowerCase() === q)
  }, [query, sorted])

  function commit(value: string) {
    setQuery(value)
    setOpen(false)
    // Сброс выделения
    setHighlight(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min((h<0? -1: h) + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max((h<=0? 0: h) - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered.length > 0) {
        e.preventDefault()
        const idx = highlight >= 0 ? highlight : 0
        commit(filtered[idx])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function onBlur() {
    // При потере фокуса — разрешаем только список
    const q = (query || '').trim().toLowerCase()
    const match = sorted.find(c => c.toLowerCase() === q)
    if (!match) {
      // если есть единственный строгий матч по регистронезависимому равенству — выбрать его, иначе очистить
      setQuery('')
    } else {
      setQuery(match)
    }
    setOpen(false)
  }

  React.useEffect(() => {
    if (!open) return
    // Прокрутка выделенного элемента в видимую область
    const timer = setTimeout(() => {
      const el = listRef.current?.querySelector('[data-active="true"]') as HTMLElement | null
      if (el) el.scrollIntoView({ block: 'nearest' })
    }, 0)
    return () => clearTimeout(timer)
  }, [open, highlight])

  // Отрисовка
  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={`input pr-8 ${query && !isValid ? 'border-red-300 focus:border-red-400' : ''}`}
        placeholder="Начните вводить город"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`city-listbox-${name}`}
        aria-autocomplete="list"
      />
      {/* hidden normalized field */}
      <input type="hidden" name={name} value={isValid ? query : ''} />
      {/* dropdown */}
      {open && (
        <div
          ref={listRef}
          id={`city-listbox-${name}`}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded border bg-white text-sm shadow text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-muted">Нет в списке, выберите другой</div>
          ) : (
            filtered.map((c, i) => {
              const active = i === highlight
              return (
                <div
                  key={c}
                  role="option"
                  aria-selected={active}
                  data-active={active ? 'true' : 'false'}
                  className={`px-3 py-2 cursor-pointer ${active ? 'bg-indigo-600 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); commit(c) }}
                >
                  {c}
                </div>
              )
            })
          )}
        </div>
      )}
      {/* state hint */}
      {query && !isValid && (
        <div className="mt-1 text-xs text-amber-700">Нет в списке, выберите другой</div>
      )}
    </div>
  )
}
