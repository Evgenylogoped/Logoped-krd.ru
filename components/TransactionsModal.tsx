"use client"
import React from 'react'

type Tx = {
  id: string
  createdAt: string | Date
  kind?: string | null
  amount?: number | null
  meta?: any
  lessonId?: string | null
}

function kindLabel(kind?: string | null) {
  const k = String(kind || '').toUpperCase()
  if (k === 'PAYOUT') return 'Выплата'
  if (k === 'THERAPIST_BALANCE') return 'Начисление логопеду'
  if (k === 'CASH_HELD') return 'Долг логопеда'
  if (k === 'REVENUE') return 'Выручка филиала'
  return k || 'Транзакция'
}

export default function TransactionsModal({ trigger, items }: { trigger: React.ReactNode; items: Tx[] }) {
  const [open, setOpen] = React.useState(false)
  // Здесь приходят последние 15 выплат логопеду
  const total = (items||[]).reduce((s,tx)=> s + Number(tx.amount||0), 0)
  return (
    <>
      <button type="button" className="btn btn-outline" onClick={()=>setOpen(true)}>{trigger}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={()=>setOpen(false)}>
          <div className="w-full sm:w-[92%] sm:max-w-md rounded-t-xl sm:rounded-xl bg-white text-black p-3 sm:p-4 shadow-lg" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Крайние 15 выплат логопеду</div>
                <div className="text-xs text-muted">Итого: {total.toLocaleString('ru-RU')} ₽</div>
              </div>
              <button className="text-sm text-muted" onClick={()=>setOpen(false)}>Закрыть</button>
            </div>
            <div className="mt-2 overflow-x-auto card-table p-2">
              {(!items || items.length===0) ? (
                <div className="text-sm text-muted">Нет выплат</div>
              ) : (
                <table className="min-w-full text-sm table-zebra leading-tight">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-2 pr-4">Дата</th>
                      <th className="py-2 pr-4 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items?.map(tx => (
                      <tr key={tx.id}>
                        <td className="py-2 pr-4">{new Date(tx.createdAt).toLocaleString('ru-RU')}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{Number(tx.amount||0).toLocaleString('ru-RU')} ₽</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="py-2 pr-4 font-semibold">ИТОГО</td>
                      <td className="py-2 pr-4 font-semibold text-right">{total.toLocaleString('ru-RU')} ₽</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
