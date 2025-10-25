"use client"

import React from 'react'

function normalizePhone(raw: string): string | null {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  // RU defaults: 8XXXXXXXXXX -> 7XXXXXXXXXX, 10 digits -> prepend 7
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1)
  if (digits.length === 10) digits = '7' + digits
  if (!digits.startsWith('7') && !digits.startsWith('1') && !digits.startsWith('3') && !digits.startsWith('4') && !digits.startsWith('9')) {
    // if unknown country, try to keep as-is
  }
  return digits
}

export default function ContactButtons({ rawPhone }: { rawPhone: string | undefined }) {
  const digits = normalizePhone(rawPhone || '')
  if (!digits) return null

  const telHref = `tel:+${digits}`
  const waApp = `whatsapp://send?phone=${digits}`
  const waWeb = `https://wa.me/${digits}`
  const maxApp = `max://chat?phone=${digits}`
  const maxWeb1 = `https://max.me/chat/+${digits}`
  const maxWeb2 = `https://max.ru/chat/+${digits}`

  const tryOpen = (primary: string, fallbacks: string[]) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    // Try to open primary (app scheme). On iOS/Android Safari/Chrome this will switch context if app installed.
    const win = window
    // First set location to primary
    let navigated = false
    try {
      win.location.href = primary
      navigated = true
    } catch {}
    // Chain fallbacks with slight delays to allow app switch if supported
    let i = 0
    const tick = () => {
      if (i >= fallbacks.length) return
      try { win.location.href = fallbacks[i++] } catch {}
      if (i < fallbacks.length) setTimeout(tick, 200)
    }
    setTimeout(tick, 200)
  }

  return (
    <span className="inline-flex items-center gap-1 ml-2">
      <a href={telHref} className="btn btn-outline btn-sm" title="D83DDCDE">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>
      </a>
      <a href={waWeb} onClick={tryOpen(waApp, [waWeb])} className="btn btn-outline btn-sm" title="WhatsApp">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.149-.67.15-.198.297-.767.966-.94 1.165-.173.198-.347.223-.644.074-.297-.148-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.654-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.373-.025-.522-.075-.149-.669-1.613-.916-2.206-.242-.58-.487-.5-.669-.51l-.57-.01c-.198 0-.521 .074-.793 .372-.272 .298-1.041 1.016-1.041 2.479 0 1.462 1.066 2.875 1.213 3.074 .149 .198 2.1 3.2 5.083 4.487 .71 .306 1.263 .489 1.694 .626 .712 .227 1.36 .195 1.872 .118 .571 -.085 1.758 -.718 2.006 -1.41 .248 -.69 .248 -1.282 .173 -1.41 -.074 -.124 -.272 -.198 -.57 -.347z"/><path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.373 0 0 5.373 0 12c0 2.114 .553 4.096 1.52 5.82L0 24l6.38 -1.48A11.94 11.94 0 0 0 12 24c6.627 0 12 -5.373 12 -12 0 -3.19 -1.242 -6.096 -3.48 -8.52zM12 22a9.93 9.93 0 0 1 -5.062 -1.387l-.363 -.215 -3.778 .88 .805 -3.687 -.23 -.378A9.94 9.94 0 1 1 12 22z"/></svg>
      </a>
      <a href={maxWeb1} onClick={tryOpen(maxApp, [maxWeb1, maxWeb2])} className="btn btn-outline btn-sm" title="Max">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="#5B21B6"/>
          <path d="M7 16V8h2.2l2.3 3.9L13.8 8H16v8h-2v-4.1l-1.5 2.6h-1L10 11.9V16H8z" fill="#fff"/>
        </svg>
      </a>
    </span>
  )
}
