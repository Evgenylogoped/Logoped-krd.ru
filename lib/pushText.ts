export function formatFioShort(input: any): string {
  const ln = (input?.lastName || '').trim()
  const fn = (input?.firstName || '').trim()
  const mn = (input?.middleName || '').trim()
  if (ln && fn) {
    const fi = fn ? fn[0].toUpperCase()+'.' : ''
    const mi = mn ? mn[0].toUpperCase()+'.' : ''
    return `${ln} ${fi}${mi}`.trim()
  }
  const name = (input?.name || '').trim()
  if (ln && name) return `${ln} ${name}`
  const email = (input?.email || '').trim()
  return name || email || 'пользователь'
}

export function firstWords(text: string, n: number): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const parts = t.split(' ')
  if (parts.length <= n) return t
  return parts.slice(0, n).join(' ')
}

export function toMskDate(d: Date): Date { return new Date(d.getTime() + 3*3600*1000) }
export function formatTimeMsk(date: Date | string): string {
  const d = new Date(date)
  const msk = toMskDate(d)
  const hh = String(msk.getUTCHours()).padStart(2,'0')
  const mm = String(msk.getUTCMinutes()).padStart(2,'0')
  return `${hh}:${mm}`
}
export function formatDateMsk(date: Date | string): string {
  const d = new Date(date)
  const msk = toMskDate(d)
  const dd = String(msk.getUTCDate()).padStart(2,'0')
  const mm = String(msk.getUTCMonth()+1).padStart(2,'0')
  const yyyy = String(msk.getUTCFullYear())
  return `${dd}.${mm}.${yyyy}`
}
export function formatDateTimeMsk(date: Date | string): string { return `${formatDateMsk(date)} ${formatTimeMsk(date)}` }

export function pluralZanyatie(n: number): string {
  const mod10 = n % 10; const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'занятие'
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'занятия'
  return 'занятий'
}
