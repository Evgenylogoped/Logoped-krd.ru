"use client"
import React from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const WHITELIST = [
  '79889543377@yandex.ru',
  'nov1koveu9@yandex.ru',
  'kadetik@mail.ru',
]

export default function PurgeToolsPage() {
  const { data } = useSession()
  const email = (data?.user as any)?.email as string | undefined
  const role = (data?.user as any)?.role as string | undefined
  const allowed = Boolean(email && WHITELIST.includes(email) && (role==='ADMIN' || role==='SUPER_ADMIN'))
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<string>("")

  async function runPurge() {
    if (!allowed || busy) return
    setBusy(true)
    setResult("")
    try {
      const res = await fetch('/api/admin/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'I_CONFIRM_PURGE' })
      })
      const j = await res.json().catch(()=>null)
      if (!res.ok) {
        setResult(`Ошибка: ${j?.error || res.status}`)
      } else {
        setResult(`Готово: удалено пользователей ${j?.deletedUsers ?? 0}. Оставлены: ${Array.isArray(j?.kept)? j.kept.join(', ') : ''}`)
      }
    } catch (e:any) {
      setResult(`Сбой: ${e?.message || 'unknown'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Очистка демо-данных</h1>
      <Card>
        {!allowed ? (
          <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Доступ только для ADMIN/SUPER_ADMIN из белого списка.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded border p-3 bg-red-50 text-red-800 text-sm">
              ВНИМАНИЕ: операция необратима. Будут удалены все пользователи и данные, кроме трёх администраторов.
            </div>
            <Button variant="danger" onClick={runPurge} loading={busy}>
              Очистить демо-данные
            </Button>
            {result && (
              <pre className="text-xs text-muted border rounded p-2 overflow-auto">{result}</pre>
            )}
            <div className="text-xs text-muted">
              Белый список: {WHITELIST.join(', ')}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
