import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getConversationSettings, updateConversationSettings, setParticipantState } from '@/app/chat/settings/actions'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function ChatSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="container py-6">Доступ запрещён</div>
  const selfId = (session.user as any).id as string
  const role = (session.user as any).role as string
  const { id: conversationId } = await params

  // Проверка доступа и загрузка данных через серверные экшены
  let payload: any
  try {
    payload = await getConversationSettings(conversationId)
  } catch (e: any) {
    return <div className="container py-6">Нет доступа к настройкам</div>
  }
  const { settings, participants, states } = payload

  async function saveSettings(formData: FormData) {
    'use server'
    const convId = String(formData.get('conversationId') || '')
    const backgroundUrl = String(formData.get('backgroundUrl') || '').trim() || null
    const backgroundColor = String(formData.get('backgroundColor') || '').trim() || null
    const postingPolicy = String(formData.get('postingPolicy') || 'ALL')
    // restricted map from checkboxes: restricted:userId=on means allowed; for policy RESTRICTED, missing means false
    const entries: [string, boolean][] = []
    formData.forEach((v, k) => {
      if (k.startsWith('allowed:')) {
        const uid = k.slice('allowed:'.length)
        entries.push([uid, v === 'on'])
      }
    })
    const restrictedMap: Record<string, boolean> = {}
    for (const [uid, allowed] of entries) restrictedMap[uid] = allowed
    await updateConversationSettings(convId, { backgroundUrl, backgroundColor, postingPolicy, restrictedMap })
  }

  async function saveParticipant(formData: FormData) {
    'use server'
    const convId = String(formData.get('conversationId') || '')
    const targetUserId = String(formData.get('userId') || '')
    const canPost = formData.get('canPost') === 'on'
    const bannedUntil = String(formData.get('bannedUntil') || '').trim() || null
    const mutedUntil = String(formData.get('mutedUntil') || '').trim() || null
    await setParticipantState(convId, targetUserId, { canPost, bannedUntil, mutedUntil })
  }

  const policy = settings?.postingPolicy || 'ALL'
  const restricted = (settings?.restrictedJson || {}) as Record<string, boolean>

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Настройки группы</h1>
      </div>

      <form action={saveSettings} className="space-y-3 p-3 rounded border" style={{ background: 'var(--card-bg)' }}>
        <input type="hidden" name="conversationId" value={conversationId} />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Фон (URL)</span>
            <input name="backgroundUrl" defaultValue={settings?.backgroundUrl || ''} className="input input-bordered" placeholder="https://..." />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Фон (цвет)</span>
            <input name="backgroundColor" defaultValue={settings?.backgroundColor || ''} className="input input-bordered" placeholder="#ECE5DD" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Политика постинга</span>
            <select name="postingPolicy" defaultValue={policy} className="select select-bordered">
              <option value="ALL">Все участники</option>
              <option value="LOGOPED_ONLY">Только логопед</option>
              <option value="RESTRICTED">Ограниченный список</option>
            </select>
          </label>
        </div>
        {policy === 'RESTRICTED' && (
          <div className="pt-2">
            <div className="text-sm text-muted mb-2">Разрешённые участники</div>
            <div className="grid md:grid-cols-2 gap-2">
              {(participants || []).map((p: any) => (
                <label key={p.userId} className="flex items-center gap-2 p-2 rounded border" style={{ background: 'var(--card-bg)' }}>
                  <input type="checkbox" name={`allowed:${p.userId}`} defaultChecked={Boolean(restricted[p.userId] ?? true)} />
                  <span className="text-sm">{p.user?.name || p.user?.email}</span>
                  <span className="text-xs text-muted ml-auto">{p.role}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="pt-2">
          <button className="btn btn-primary">Сохранить настройки</button>
        </div>
      </form>

      <div className="space-y-2">
        <div className="text-sm text-muted">Участники</div>
        <div className="grid gap-2">
          {(participants || []).map((p: any) => {
            const st = (states || []).find((s: any) => s.userId === p.userId)
            return (
              <form key={p.userId} action={saveParticipant} className="p-3 rounded border grid sm:grid-cols-5 gap-2 items-end" style={{ background: 'var(--card-bg)' }}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="userId" value={p.userId} />
                <div className="sm:col-span-2">
                  <div className="font-medium">{p.user?.name || p.user?.email}</div>
                  <div className="text-xs text-muted">{p.role}</div>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="canPost" defaultChecked={st?.canPost !== false} />
                  <span className="text-sm">Можно писать</span>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Mute до</span>
                  <input type="datetime-local" name="mutedUntil" defaultValue={st?.mutedUntil ? new Date(st.mutedUntil).toISOString().slice(0,16) : ''} className="input input-bordered" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Ban до</span>
                  <input type="datetime-local" name="bannedUntil" defaultValue={st?.bannedUntil ? new Date(st.bannedUntil).toISOString().slice(0,16) : ''} className="input input-bordered" />
                </label>
                <div className="sm:col-span-5">
                  <button className="btn btn-sm">Сохранить</button>
                </div>
              </form>
            )
          })}
        </div>
      </div>
    </div>
  )
}
