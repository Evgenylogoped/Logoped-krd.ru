import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateUserRole, promoteToAdmin, demoteAdmin, promoteToAccountant, demoteAccountant, setVip, setVipPlus, clearVip } from './actions'
import { confirmEmail } from './actions'
import VipBadge from '@/components/VipBadge'
import { Card } from '@/components/ui/Card'
import { Toolbar } from '@/components/ui/Toolbar'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

export default async function AdminUsersPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div>Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string, string>
  const q = (sp.q || '').trim()
  const roleFilter = sp.role || 'ANY'
  const cityFilter = (sp.city || '').trim()
  const verifiedFilter = sp.verified || ''
  const page = Math.max(1, Number(sp.page || '1') || 1)
  const pageSize = 20
  const where: any = {}
  if (q) where.OR = [{ email: { contains: q } }, { name: { contains: q } }]
  if (roleFilter && roleFilter !== 'ANY') where.role = roleFilter
  if (cityFilter) where.city = cityFilter
  if (verifiedFilter === 'yes') where.emailVerifiedAt = { not: null as any }
  if (verifiedFilter === 'no') where.emailVerifiedAt = null
  const cityRaw = await prisma.user.findMany({ where: { city: { not: null as any } }, select: { city: true }, distinct: ['city'] as any })
  const cityOptions = Array.from(new Set((cityRaw || []).map(x => (x as any).city).filter(Boolean))).sort()
  const users = await prisma.user.findMany({ where, orderBy: [
    { featuredSuper: 'desc' as any },
    { featured: 'desc' as any },
    { createdAt: 'desc' as any },
  ], take: 200 })
  const total = users.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const usersPage = users.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Пользователи</h1>
      <form method="get">
        <Toolbar className="gap-3">
          <label className="grid gap-1">
            <span className="text-sm">Поиск</span>
            <Input name="q" defaultValue={q} placeholder="email или имя" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm">Роль</span>
            <Select name="role" defaultValue={roleFilter} className="!py-2 !px-2">
              <option value="ANY">Любая</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="ADMIN">ADMIN</option>
              <option value="ACCOUNTANT">ACCOUNTANT</option>
              <option value="LOGOPED">LOGOPED</option>
              <option value="PARENT">PARENT</option>
            </Select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm">Город</span>
            <Select name="city" defaultValue={cityFilter} className="!py-2 !px-2">
              <option value="">Любой</option>
              {cityOptions.map(c => <option key={c} value={c as string}>{c as string}</option>)}
            </Select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm">Email</span>
            <Select name="verified" defaultValue={verifiedFilter} className="!py-2 !px-2">
              <option value="">Любой</option>
              <option value="yes">Подтверждён</option>
              <option value="no">Не подтверждён</option>
            </Select>
          </label>
          <Button type="submit">Фильтровать</Button>
        </Toolbar>
      </form>
      <Card>
        {usersPage.length === 0 ? (
          <EmptyState title="Пользователей пока нет" />
        ) : (
          <div className="overflow-auto"><Table className="min-w-[900px]">
            <THead>
              <TR>
                <TH>Имя</TH>
                <TH>Email</TH>
                <TH>Роль</TH>
                <TH>Город</TH>
                <TH>Подтверждение</TH>
                <TH>VIP</TH>
                <TH>Действия</TH>
              </TR>
            </THead>
            <TBody>
              {usersPage.map(u => (
                <TR key={u.id}>
                  <TD>
                    <div className="font-medium inline-flex items-center gap-2">
                      {u.name || u.email}
                      {u.role === 'LOGOPED' && ((u as any).featuredSuper || (u as any).featured) && (
                        <VipBadge level={(u as any).featuredSuper ? 'VIP+' : 'VIP'} />
                      )}
                    </div>
                  </TD>
                  <TD className="text-muted">{u.email}</TD>
                  <TD>{u.role}</TD>
                  <TD>{u.city || '—'}</TD>
                  <TD>{u.emailVerifiedAt ? (<span className="badge" style={{background:'#ecfdf5', color:'#065f46'}}>Подтвержден</span>) : (<span className="badge" style={{background:'#fffbeb', color:'#92400e'}}>Не подтвержден</span>)}{!u.emailVerifiedAt && (<form action={confirmEmail} className="inline-block ml-2"><input type="hidden" name="id" value={u.id} /><Button size="xs">Подтвердить email</Button></form>)}</TD>
                  <TD>{u.role === 'LOGOPED' ? (((u as any).featuredSuper ? 'VIP+' : ((u as any).featured ? 'VIP' : '—'))) : '—'}</TD>
                  <TD className="flex flex-wrap items-center gap-2">
                    <form action={updateUserRole} className="inline-flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <Select name="role" defaultValue={u.role} className="!py-1 !px-2 text-sm w-auto">
                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="ACCOUNTANT">ACCOUNTANT</option>
                        <option value="LOGOPED">LOGOPED</option>
                        <option value="PARENT">PARENT</option>
                      </Select>
                      <Button size="sm">Сохранить</Button>
                    </form>
                    {u.role === 'LOGOPED' && (
                      <>
                        <form action={setVip} className="inline-block">
                          <input type="hidden" name="id" value={u.id} />
                          <Button size="sm">VIP</Button>
                        </form>
                        <form action={setVipPlus} className="inline-block">
                          <input type="hidden" name="id" value={u.id} />
                          <Button size="sm">VIP+</Button>
                        </form>
                        {((u as any).featured || (u as any).featuredSuper) && (
                          <form action={clearVip} className="inline-block">
                            <input type="hidden" name="id" value={u.id} />
                            <Button size="sm" variant="danger">Снять VIP</Button>
                          </form>
                        )}
                      </>
                    )}
                    <form action={promoteToAdmin} className="inline-block">
                      <input type="hidden" name="id" value={u.id} />
                      <Button size="sm">Сделать админом</Button>
                    </form>
                    <form action={demoteAdmin} className="inline-block">
                      <input type="hidden" name="id" value={u.id} />
                      <Button size="sm" variant="ghost">Снять админа</Button>
                    </form>
                    <form action={promoteToAccountant} className="inline-block">
                      <input type="hidden" name="id" value={u.id} />
                      <Button size="sm">Сделать бухгалтером</Button>
                    </form>
                    <form action={demoteAccountant} className="inline-block">
                      <input type="hidden" name="id" value={u.id} />
                      <Button size="sm" variant="ghost">Снять бухгалтера</Button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table></div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end mt-3">
            <Pagination
              page={page}
              pageCount={pages}
              makeHref={(p)=>{
                const params = new URLSearchParams({ q, role: roleFilter, page: String(p) })
                return `?${params.toString()}`
              }}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
