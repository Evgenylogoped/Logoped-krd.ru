/* eslint-disable */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const prisma = new PrismaClient()

async function main() {
  // Admin accounts (production whitelist)
  const allUsers = [
    {
      email: '79889543377@yandex.ru',
      name: 'Алиса (Директор по маркетингу)',
      role: 'ACCOUNTANT',
      password: '355722!!??',
    },
    {
      email: 'nov1koveu9@yandex.ru',
      name: 'Коммерческий директор',
      role: 'ADMIN',
      password: '355722!!??2',
    },
    {
      email: 'kadetik@mail.ru',
      name: 'Евгений Владимирович Н (Учредитель)',
      role: 'SUPER_ADMIN',
      password: '355722Kk!!??1',
    },
  ]
  for (const u of allUsers) {
    const hash = await bcrypt.hash(u.password, 10)
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, role: u.role, name: u.name || u.role },
      create: { email: u.email, passwordHash: hash, role: u.role, name: u.name || u.role },
    })
  }

  console.log('Seed completed. Admin users ensured:', allUsers.map(u=>u.email))
}

main().finally(async () => {
  await prisma.$disconnect()
})
