import React from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

type Size = 'sm' | 'md'

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  const base = 'btn'
  const byVariant: Record<Variant, string> = {
    primary: 'btn-primary',
    secondary: '',
    danger: 'btn-danger',
    ghost: '',
  }
  const bySize: Record<Size, string> = {
    sm: 'text-sm py-1.5 px-2.5',
    md: 'text-sm',
  }
  return (
    <button
      {...rest}
      className={cn(base, byVariant[variant], bySize[size], loading && 'opacity-70 pointer-events-none', className)}
      disabled={loading || rest.disabled}
    >
      {loading ? 'Загрузка…' : children}
    </button>
  )
}
