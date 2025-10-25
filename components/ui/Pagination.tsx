import React from 'react'
import { cn } from './cn'
import { Button } from './Button'

export function Pagination({ page, pageCount, makeHref, className }: { page: number; pageCount: number; makeHref: (p: number) => string; className?: string }) {
  if (pageCount <= 1) return null
  const prev = Math.max(1, page - 1)
  const next = Math.min(pageCount, page + 1)
  const pages: number[] = []
  for (let i = 1; i <= pageCount; i++) pages.push(i)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <a href={makeHref(prev)}><Button size="sm" variant="ghost" disabled={page===1}>Назад</Button></a>
      <div className="flex items-center gap-1">
        {pages.map(p => (
          <a key={p} href={makeHref(p)}>
            <Button size="sm" variant={p===page? 'primary' : 'ghost'}>{p}</Button>
          </a>
        ))}
      </div>
      <a href={makeHref(next)}><Button size="sm" variant="ghost" disabled={page===pageCount}>Вперёд</Button></a>
    </div>
  )
}
