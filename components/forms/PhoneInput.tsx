"use client"

import React from 'react'

// +7 (XXX) XXX-XX-XX mask with digits only storage
export default function PhoneInput({ name, defaultValue, required }: { name: string; defaultValue?: string | null; required?: boolean }) {
  const [val, setVal] = React.useState<string>(format(initial(defaultValue)))

  function initial(v?: string | null) {
    const s = String(v || '')
    // normalize to digits; allow starting with +7 or 8
    const digits = s.replace(/\D/g, '')
    if (!digits) return '+7 '
    let d = digits
    if (d.startsWith('8')) d = '7' + d.slice(1)
    if (!d.startsWith('7')) d = '7' + d
    return '+' + d
  }
  function format(raw: string): string {
    const d = raw.replace(/\D/g, '')
    let out = '+7'
    const body = d.replace(/^7/, '')
    if (body.length > 0) out += ' (' + body.substring(0, 3)
    if (body.length >= 3) out += ') '
    if (body.length > 3) out += body.substring(3, 6)
    if (body.length >= 6) out += '-' + body.substring(6, 8)
    if (body.length >= 8) out += '-' + body.substring(8, 10)
    return out
  }
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target.value
    // keep only + digits, rebuild
    const digits = ('+' + input).replace(/[^+\d]/g, '')
    setVal(format(digits))
  }
  function toPlainE164(): string {
    const d = val.replace(/\D/g, '')
    if (!d) return ''
    let num = d
    if (num.startsWith('8')) num = '7' + num.slice(1)
    if (!num.startsWith('7')) num = '7' + num
    return '+' + num.substring(0, 11)
  }
  return (
    <>
      <input
        className="input"
        value={val}
        onChange={onChange}
        inputMode="tel"
        placeholder="+7 (___) ___-__-__"
        required={required}
      />
      {/* hidden normalized field for server */}
      <input type="hidden" name={name} value={toPlainE164()} />
    </>
  )
}
