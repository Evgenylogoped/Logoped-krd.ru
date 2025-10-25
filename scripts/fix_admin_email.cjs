/* Fix admin email nov1koveu9#yandex.ru -> nov1koveu9@yandex.ru and reset password */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

async function main() {
  const prisma = new PrismaClient()
  const oldEmail = 'nov1koveu9#yandex.ru'
  const newEmail = 'nov1koveu9@yandex.ru'
  const password = '355722!!??2'
  const hash = await bcrypt.hash(password, 10)
  try {
    const old = await prisma.user.findUnique({ where: { email: oldEmail } })
    const existsNew = await prisma.user.findUnique({ where: { email: newEmail } })
    if (old && !existsNew) {
      const upd = await prisma.user.update({ where: { email: oldEmail }, data: { email: newEmail, passwordHash: hash, role: 'ADMIN', name: old.name || 'Коммерческий директор' } })
      console.log('updated_old_to_new', { id: upd.id, email: upd.email, role: upd.role })
    } else if (existsNew) {
      const upd = await prisma.user.update({ where: { email: newEmail }, data: { passwordHash: hash, role: 'ADMIN' } })
      console.log('updated_existing_new', { id: upd.id, email: upd.email, role: upd.role })
    } else {
      const created = await prisma.user.create({ data: { email: newEmail, passwordHash: hash, role: 'ADMIN', name: 'Коммерческий директор' } })
      console.log('created_new', { id: created.id, email: created.email, role: created.role })
    }
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } })
    console.log('users', users)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e)=>{ console.error(e); process.exit(1) })
