import React from 'react'
import { cn } from './cn'

export function EmptyState({ title, description, className, children }: { title: string; description?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('text-center text-sm text-muted p-6 border rounded', className)}>
      <div className="font-medium text-base text-foreground mb-1">{title}</div>
      {description && <div className="mb-2">{description}</div>}
      {children}
    </div>
  )
}
