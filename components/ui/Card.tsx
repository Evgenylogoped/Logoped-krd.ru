import React from 'react'
import { cn } from './cn'

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('card p-4', className)}>
      {children}
    </div>
  )
}
