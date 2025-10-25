"use client"

import React from 'react'

export type LessonRow = {
  when: string
  type: string
  price: number
  childName: string
}

export default function LessonsModal({ trigger, rows, title }:{ trigger: React.ReactNode; rows: LessonRow[]; title?: string }){
  const [open, setOpen] = React.useState(false)
  const total = (rows||[]).reduce((s,r)=> s + Number(r.price||0), 0)
  return (
    <>
      <button type="button" className="underline text-xs" onClick={()=>setOpen(true)}>{trigger}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={()=>setOpen(false)}>
          <div className="w-full sm:w-[92%] sm:max-w-2xl rounded-t-xl sm:rounded-xl bg-white text-black p-3 sm:p-4 shadow-lg" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{title || 'Уроки в заявке'}</div>
                <div className="text-xs text-muted">Итого по урокам: {total.toLocaleString('ru-RU')} ₽</div>
              </div>
              <button className="text-sm text-muted" onClick={()=>setOpen(false)}>Закрыть</button>
            </div>
            <div className="mt-2 overflow-x-auto card-table p-2">
              <table className="min-w-full text-sm table-zebra leading-tight">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-2 pr-4">Дата</th>
                    <th className="py-2 pr-4">Тип</th>
                    <th className="py-2 pr-4 text-right">Сумма</th>
                    <th className="py-2 pr-4">Урок</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows||[]).length===0 ? (
                    <tr><td colSpan={4} className="py-3 text-muted">Нет уроков</td></tr>
                  ) : (
                    rows.map((r, i)=> (
                      <tr key={i}>
                        <td className="py-2 pr-4">{r.when}</td>
                        <td className="py-2 pr-4">{r.type}</td>
                        <td className="py-2 pr-4 text-right">{Number(r.price||0).toLocaleString('ru-RU')} ₽</td>
                        <td className="py-2 pr-4">{r.childName || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="py-2 pr-4 font-semibold">ИТОГО</td>
                    <td></td>
                    <td className="py-2 pr-4 font-semibold text-right">{total.toLocaleString('ru-RU')} ₽</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
