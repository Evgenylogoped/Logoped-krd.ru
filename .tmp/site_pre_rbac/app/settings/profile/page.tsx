import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateProfile, uploadAvatar, deleteAvatar, updateTheme } from './actions'
import ThemePicker from '@/components/settings/ThemePicker'
import ChildPhotoUploader from '@/components/ChildPhotoUploader'
import SubmitButton from '@/components/forms/SubmitButton'
import VisibilityToggles from '@/components/profile/VisibilityToggles'
import AfterSaveRefresh from '@/components/profile/AfterSaveRefresh'

export const revalidate = 0
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function SettingsProfilePage({ searchParams }: { searchParams?: Promise<{ saved?: string; photoError?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
  const isParent = user?.role === 'PARENT'
  const parent = isParent ? await prisma.parent.findUnique({ where: { userId } }) : null
  const sp = (searchParams ? await searchParams : {}) as { saved?: string; photoError?: string }
  return (
    <div className="space-y-6">
      <AfterSaveRefresh />
      <h1 className="text-2xl font-bold">Профиль</h1>
      {sp?.saved === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Изменения сохранены</div>
      )}
      {sp?.photoError && (
        <div className="rounded border p-3 bg-red-50 text-red-800 text-sm">Ошибка загрузки фото. Допустимы изображения до 10 МБ.</div>
      )}

      {/* Фото профиля */}
      <section className="section max-w-3xl">
        <h2 className="text-lg font-semibold mb-2">Фото профиля</h2>
        <div className="grid gap-3 sm:grid-cols-3 items-start">
          <div className="sm:col-span-2">
            <ChildPhotoUploader childId={userId} action={uploadAvatar as any} defaultImageUrl={user?.image || null} />
          </div>
          <div className="sm:col-span-1 flex items-start justify-start">
            {user?.image && (
              <form action={deleteAvatar}>
                <button className="btn btn-outline btn-sm">Удалить фото</button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Тема интерфейса */}
      <section className="section max-w-3xl">
        <h2 className="text-lg font-semibold mb-2">Тема интерфейса</h2>
        <form action={updateTheme} className="grid gap-3">
          <ThemePicker initialTheme={(user as any)?.theme || null} />
          <div>
            <button className="btn btn-primary btn-sm">Сохранить тему</button>
          </div>
        </form>
      </section>
      <form action={updateProfile} className="relative grid gap-3 sm:grid-cols-2 max-w-3xl">
        {/* Оверлей на время сохранения (управляется свойством disabled у fieldset через CSS утилиты) */}
        {/* Мы используем SubmitButton ниже для фактического pending */}
        <label className="grid gap-1">
          <span className="text-sm text-muted">Имя (ФИО)</span>
          <input name="name" className="input" defaultValue={user?.name || parent?.fullName || ''} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Город</span>
          <input name="city" className="input" list="city-list" defaultValue={(user as any)?.city || ''} placeholder="Начните вводить и выберите из подсказки" />
          <datalist id="city-list">
            <option value="Москва" />
            <option value="Санкт-Петербург" />
            <option value="Новосибирск" />
            <option value="Екатеринбург" />
            <option value="Казань" />
            <option value="Нижний Новгород" />
            <option value="Челябинск" />
            <option value="Самара" />
            <option value="Омск" />
            <option value="Ростов-на-Дону" />
            <option value="Красноярск" />
            <option value="Воронеж" />
            <option value="Пермь" />
            <option value="Волгоград" />
            <option value="Краснодар" />
          </datalist>
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Часовой пояс</span>
          <input name="timeZone" className="input" defaultValue={(user as any)?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone} />
        </label>
        {isParent && (
          <label className="grid gap-1">
            <span className="text-sm text-muted">Телефон</span>
            <input name="phone" className="input" defaultValue={parent?.phone || ''} />
          </label>
        )}
        {user?.role === 'LOGOPED' && (
          <>
            <div className="grid gap-1 sm:col-span-2">
              <span className="text-sm text-muted">Филиал (организация)</span>
              <div className="rounded border px-3 py-2 bg-gray-50 text-sm">
                {(user as any)?.branch ? (
                  <span>{(user as any).branch.company?.name ? `${(user as any).branch.company.name} — ${(user as any).branch.name}` : (user as any).branch.name}</span>
                ) : (
                  <span className="text-muted">— Без филиала —</span>
                )}
              </div>
              {(user as any)?.branch && (
                <label className="inline-flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" name="clearBranch" />
                  Сменить на «Без филиала»
                </label>
              )}
              <div className="text-xs text-muted">Присоединение к филиалу выполняется по запросу руководителя. Руководителю филиал назначается автоматически при создании организации.</div>
            </div>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-sm text-muted">Адрес (место проведения занятий)</span>
              <input name="address" className="input" defaultValue={(user as any)?.address || ''} placeholder="например: ул. Ленина, 10, каб. 5" />
            </label>
            <div className="grid gap-1 sm:grid-cols-2 sm:col-span-2">
              <label className="grid gap-1">
                <span className="text-sm text-muted">Цена занятия (руб.)</span>
                <input name="lessonPrice" type="number" min={0} step={50} className="input" defaultValue={(user as any)?.lessonPrice ?? ''} />
              </label>
              <label className="inline-flex items-center gap-2 mt-6">
                <input type="checkbox" name="showPriceToParents" defaultChecked={(user as any)?.showPriceToParents} />
                <span className="text-sm text-muted">Показывать цену клиентам</span>
              </label>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 sm:col-span-2">
              <label className="inline-flex items-center gap-2 mt-1">
                <input type="checkbox" name="isOnline" defaultChecked={(user as any)?.isOnline} />
                <span className="text-sm text-muted">Онлайн‑занятия</span>
              </label>
              <label className="inline-flex items-center gap-2 mt-1">
                <input type="checkbox" name="isOffline" defaultChecked={(user as any)?.isOffline} />
                <span className="text-sm text-muted">Офлайн‑занятия</span>
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-sm text-muted">Профессия</span>
              <input name="profession" className="input" defaultValue={(user as any)?.profession || ''} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-muted">Стаж (лет)</span>
              <input name="experienceYears" type="number" min={0} className="input" defaultValue={(user as any)?.experienceYears || ''} />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-sm text-muted">Специализация</span>
              <input name="specialization" className="input" defaultValue={(user as any)?.specialization || ''} placeholder="Например: ОНР, ЗРР, звукопроизношение" />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-sm text-muted">О себе</span>
              <textarea name="about" className="input min-h-[96px]" defaultValue={(user as any)?.about || ''} />
              <VisibilityToggles initialShowAbout={!((user as any)?.hideAboutFromParents)} initialShowEducation={!((user as any)?.hideEducationFromParents)} />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-sm text-muted">Образование</span>
              <textarea name="education" className="input min-h-[96px]" defaultValue={(user as any)?.education || ''} />
            </label>
          </>
        )}
        <div className="sm:col-span-2 pt-2"><SubmitButton className="btn btn-primary" /></div>
      </form>
      {isParent && (
        <div className="text-xs text-muted">Управление детьми находится в разделе «Дети» настроек.</div>
      )}
    </div>
  )
}
