"use server"
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function assertParent(session: any) {
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') throw new Error('Forbidden')
}

export async function createChild(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  assertParent(session)
  const userId = (session!.user as any).id
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!parent) throw new Error('Parent not found')

  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const birthDateStr = String(formData.get('birthDate') || '')
  const birthDate = birthDateStr ? new Date(birthDateStr) : null
  if (!firstName || !lastName) {
    revalidatePath('/parent/children')
    return
  }

  await prisma.child.create({ data: { parentId: parent.id, firstName, lastName, birthDate: birthDate || undefined } })
  revalidatePath('/parent/children')
}

export async function deleteChild(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  assertParent(session)
  const userId = (session!.user as any).id
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!parent) throw new Error('Parent not found')

  const id = String(formData.get('id') || '')
  const row = await prisma.child.findUnique({ where: { id } })
  if (!row || row.parentId !== parent.id) { revalidatePath('/parent/children'); return }
  await prisma.child.delete({ where: { id } })
  revalidatePath('/parent/children')
}
