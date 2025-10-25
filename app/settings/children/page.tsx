import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addChild, deleteChild, updateChild, uploadChildPhoto, deleteChildPhoto } from './actions'
import ChildPhotoUploader from '@/components/ChildPhotoUploader'

export const revalidate = 0
export const runtime = 'nodejs'

export default async function SettingsChildrenPage({ searchParams }: { searchParams?: Promise<{ saved?: string; photoError?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.role !== 'PARENT') return <div className="py-6">Доступ запрещён</div>
  const parent = await prisma.parent.findUnique({ where: { userId } })
  const children = parent
    ? await prisma.child.findMany({
        where: { parentId: parent.id, isArchived: false },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    : []

  const sp = (searchParams ? await searchParams : {}) as { saved?: string; photoError?: string }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Дети</h1>
      {sp?.saved === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Изменения сохранены</div>
      )}
      {sp?.photoError === 'type' && (
        <div className="rounded border p-3 bg-red-50 text-red-800 text-sm">Неверный тип файла. Допустимо: JPG, PNG, WEBP.</div>
      )}
      {sp?.photoError === 'size' && (
        <div className="rounded border p-3 bg-red-50 text-red-800 text-sm">Слишком большой файл. Максимум 5 МБ.</div>
      )}
      <form action={addChild} className="grid gap-3 sm:grid-cols-4 items-end max-w-3xl">
        <label className="grid gap-1 sm:col-span-1">
          <span className="text-sm text-muted">Фамилия</span>
          <input name="lastName" className="input" required />
        </label>
        <label className="grid gap-1 sm:col-span-1">
          <span className="text-sm text-muted">Имя</span>
          <input name="firstName" className="input" required />
        </label>
        <label className="grid gap-1 sm:col-span-1">
          <span className="text-sm text-muted">Дата рождения</span>
          <input name="birthDate" type="date" className="input" />
        </label>
        <div className="sm:col-span-1">
          <button className="btn btn-primary w-full">Добавить</button>
        </div>
      </form>

      <div className="grid gap-4">
        {children.length === 0 && <div className="text-sm text-muted">Пока нет добавленных детей</div>}
        {children.map((c:any) => (
          <div key={c.id} className="rounded border p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">{c.lastName} {c.firstName} {c.birthDate ? `· ${new Date(c.birthDate).toLocaleDateString('ru-RU')}` : ''}</div>
              <form action={deleteChild}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-danger btn-sm">Удалить</button>
              </form>
            </div>

            <div className="grid gap-4 md:grid-cols-3 items-start">
              <div className="space-y-2">
                <ChildPhotoUploader childId={c.id} action={uploadChildPhoto as any} defaultImageUrl={c.photoUrl || null} />
                {c.photoUrl && (
                  <form action={deleteChildPhoto}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn btn-outline btn-sm">Удалить фото</button>
                  </form>
                )}
              </div>

              <form action={updateChild} className="grid gap-2 md:col-span-2">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="grid gap-1">
                    <span className="text-sm text-muted">Фамилия</span>
                    <input name="lastName" className="input" defaultValue={c.lastName} required />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-muted">Имя</span>
                    <input name="firstName" className="input" defaultValue={c.firstName} required />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-muted">Дата рождения</span>
                    <input name="birthDate" type="date" className="input" defaultValue={c.birthDate ? new Date(c.birthDate).toISOString().slice(0,10) : ''} />
                  </label>
                </div>
                <div>
                  <button className="btn btn-primary">Сохранить</button>
                </div>
              </form>
            </div>

            {/* Информация, разрешённая логопедом к просмотру родителем */}
            <div className="mt-4 grid gap-2">
              {(c as any).showDiagnosisToParent && (
                <div className="text-sm"><span className="text-muted">Диагноз: </span>{(c as any).diagnosis || '—'}</div>
              )}
              {(c as any).showConclusionToParent && (
                <div className="text-sm"><span className="text-muted">Заключение: </span>{(c as any).conclusion || '—'}</div>
              )}
              {(c as any).showPhotoToParent === false && c.photoUrl && (
                <div className="text-xs text-amber-700">Фото видно только вам. Логопед запретил отображение фото в его кабинете.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
