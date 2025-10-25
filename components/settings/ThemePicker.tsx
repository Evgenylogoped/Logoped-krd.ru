"use client"
import React from 'react'

const THEMES = [
  { id: 'default', label: 'Стандартная' },
  { id: 'kids', label: 'Детский' },
  { id: 'strict', label: 'Строгий' },
  { id: 'cartoon', label: 'Мультяшный' },
  { id: 'female', label: 'Девушка' },
  { id: 'male', label: 'Мужчина' },
  { id: 'loft', label: 'Лофт' },
  { id: 'flashy', label: 'Вызывающий' },
  { id: 'dark', label: 'Тёмный' },
  { id: 'ios', label: 'Под iPhone' },
  { id: 'retro', label: 'Ретро' },
]

export default function ThemePicker({ initialTheme, onChange }: { initialTheme?: string | null; onChange?: (v: string) => void }) {
  const [ready, setReady] = React.useState(false)
  const [theme, setTheme] = React.useState<string>('default')

  // Стабилизируем первый рендер: читаем тему после монтирования
  React.useEffect(() => {
    try {
      const t = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || initialTheme || 'default'
      setTheme(t)
      setReady(true)
    } catch { setReady(true) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!ready) return
    try {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('theme', theme)
    } catch {}
    onChange?.(theme)
  }, [theme, ready])

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted">Тема интерфейса</label>
        <select
          className="input !py-2 !px-2"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          {THEMES.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {THEMES.map(t => {
          const selected = ready && theme===t.id
          const cls = `rounded border p-2 text-left hover:bg-gray-50 transition ${selected ? 'ring-2 ring-[var(--brand)]' : ''}`
          return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={cls}
            aria-label={`Применить тему ${t.label}`}
          >
            <div className="text-sm font-medium mb-1">{t.label}</div>
            <div className="grid grid-cols-3 gap-1">
              <span className="h-4 rounded" style={{ background: 'var(--background)', border: '1px solid var(--border)' }} />
              <span className="h-4 rounded" style={{ background: 'var(--brand)' }} />
              <span className="h-4 rounded" style={{ background: 'var(--brand-hover)' }} />
            </div>
          </button>)
        })}
      </div>
      <input type="hidden" name="theme" value={theme} />
    </div>
  )
}
