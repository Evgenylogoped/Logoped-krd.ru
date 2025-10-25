import React from 'react'

export default function ModuleCard(props: {
  title: React.ReactNode
  right?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const { title, right, children, className } = props
  return (
    <div className={`rounded-2xl border shadow-lg overflow-hidden ${className || ''}`} style={{ borderColor: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(236,72,153,0.18) 100%)' }}>
        <div className="font-semibold text-sm sm:text-base">{title}</div>
        {right ? <div className="text-xs text-muted">{right}</div> : null}
      </div>
      {children !== undefined ? (
        <div className="p-3 sm:p-4">
          {children}
        </div>
      ) : null}
    </div>
  )
}
