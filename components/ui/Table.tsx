import React from 'react'
import { cn } from './cn'

export function Table({ className, children, ...rest }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <table {...rest} className={cn('table w-full text-sm', className)}>
      {children}
    </table>
  )
}

export function THead({ className, children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...rest} className={cn(className)}>{children}</thead>
}
export function TBody({ className, children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...rest} className={cn(className)}>{children}</tbody>
}
export function TR({ className, children, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...rest} className={cn(className)}>{children}</tr>
}
export function TH({ className, children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...rest} className={cn(className)}>{children}</th>
}
export function TD({ className, children, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...rest} className={cn(className)}>{children}</td>
}
