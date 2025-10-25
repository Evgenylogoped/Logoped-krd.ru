import React from 'react'
import { cn } from './cn'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest }, ref
){
  return <select ref={ref} className={cn('select', className)} {...rest}>{children}</select>
})
