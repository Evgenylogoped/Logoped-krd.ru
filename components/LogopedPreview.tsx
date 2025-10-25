"use client";
import React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";

type Props = {
  name: string
  image?: string | null
  children: React.ReactNode
  subtitleLines?: string[]
  actionHref?: string
  actionLabel?: string
  phone?: string | null
  isOnline?: boolean
  isOffline?: boolean
  lessonPrice?: number | null
  showPriceToParents?: boolean
  address?: string | null
  profession?: string | null
  experienceYears?: number | null
  specialization?: string | null
  about?: string | null
  education?: string | null
  hideAboutFromParents?: boolean
  hideEducationFromParents?: boolean
  subscription?: string | null
  instagram?: string | null
}

export default function LogopedPreviewTrigger({ name, image, children, subtitleLines = [], actionHref, actionLabel, phone, isOnline, isOffline, lessonPrice, showPriceToParents, address, profession, experienceYears, specialization, about, education, hideAboutFromParents, hideEducationFromParents, subscription, instagram }: Props) {
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => { setMounted(true) }, [])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const phoneDigits = (phone || '').replace(/[^0-9+]/g, '')
  const waDigits = (phone || '').replace(/[^0-9]/g, '')
  const instagramHref = instagram ? (instagram.startsWith('http') ? instagram : `https://instagram.com/${instagram.replace(/^@/, '')}`) : ''
  const instagramLabel = instagram ? instagram.replace(/^https?:\/\/instagram.com\//, '').replace(/^@/, '') : ''

  return (
    <>
      <button type="button" className="inline-flex items-center gap-1 min-w-0" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && mounted && createPortal((
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-[92%] max-w-sm rounded-xl bg-white p-4 shadow-lg ring-1 ring-black/5" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center gap-4">
              <img src={image || "/avatar-user.svg"} alt={name} className="h-28 w-28 rounded-md object-cover" />
              <div className="min-w-0">
                <div className="font-semibold text-base break-words">{name}</div>
                {subtitleLines.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-sm text-muted">
                    {subtitleLines.map((s, i) => (
                      <div key={i} className="break-words">{s}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* info block */}
            <div className="mt-3 space-y-1 text-sm">
              {subscription ? (<div><span className="text-muted">Подписка:</span> <span className="font-medium">{subscription}</span></div>) : null}
              {showPriceToParents && typeof lessonPrice === 'number' ? (<div><span className="text-muted">Цена занятия:</span> <span className="font-medium">{lessonPrice} ₽</span></div>) : null}
              {(isOnline || isOffline) ? (<div><span className="text-muted">Формат:</span> <span className="font-medium">{[isOnline?"онлайн":null,isOffline?"офлайн":null].filter(Boolean).join(" / ")}</span></div>) : null}
              {address ? (<div><span className="text-muted">Адрес:</span> <span className="font-medium">{address}</span></div>) : null}
              {profession ? (<div><span className="text-muted">Профессия:</span> <span className="font-medium">{profession}</span></div>) : null}
              {typeof experienceYears === 'number' ? (<div><span className="text-muted">Стаж:</span> <span className="font-medium">{experienceYears}</span> лет</div>) : null}
              {specialization ? (<div><span className="text-muted">Специализация:</span> <span className="font-medium">{specialization}</span></div>) : null}
              {!hideAboutFromParents && about ? (<div className="whitespace-pre-line"><span className="text-muted">О себе:</span> {about}</div>) : null}
              {!hideEducationFromParents && education ? (<div className="whitespace-pre-line"><span className="text-muted">Образование:</span> {education}</div>) : null}
              {instagram ? (<div><span className="text-muted">Instagram:</span> <a className="underline" target="_blank" href={instagramHref}>{instagramLabel || instagram}</a></div>) : null}
            </div>

            {/* actions */}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {(phoneDigits.length>0) && (<a className="btn btn-sm bg-blue-500 hover:bg-blue-600 border-blue-500 text-white" href={`tel:${phoneDigits}`}>📞</a>)}
              {(waDigits.length>6) && (<a className="btn btn-secondary btn-sm" target="_blank" href={`https://wa.me/${waDigits}`}>WhatsApp</a>)}
              {actionHref && actionLabel && (
                <Link href={actionHref} className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>{actionLabel}</Link>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  )
}
