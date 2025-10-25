import React from 'react'
import { cn } from './cn'

export function Toolbar({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  )
}
