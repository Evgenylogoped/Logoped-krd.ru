import '@/styles/admin.css'
import React from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Используем глобальный лэйаут и существующее меню проекта.
  // Оборачиваем контент в .admin-scope, чтобы темы/стили применялись локально.
  return <div className="admin-scope">{children}</div>
}
