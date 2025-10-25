"use client";
import React from "react";
import Link from "next/link";

type Props = {
  name: string
  image?: string | null
  children: React.ReactNode
  subtitleLines?: string[]
  actionHref?: string
  actionLabel?: string
}

export default function LogopedPreviewTrigger({ name, image, children, subtitleLines = [], actionHref, actionLabel }: Props) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button type="button" className="inline-flex items-center gap-1 min-w-0" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-[92%] max-w-sm rounded-xl bg-white p-4 shadow-lg" onClick={(e)=>e.stopPropagation()}>
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
            <div className="mt-4 flex items-center justify-end gap-2">
              {actionHref && actionLabel && (
                <Link href={actionHref} className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>{actionLabel}</Link>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
