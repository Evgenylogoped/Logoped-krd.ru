/* eslint-disable */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const prisma = new PrismaClient()

async function main() {
  const users = [
    { email: 'superadmin@novikovdom.test', role: 'SUPER_ADMIN' },
    { email: 'admin@novikovdom.test', role: 'ADMIN' },
    { email: 'logoped@novikovdom.test', role: 'LOGOPED' },
    { email: 'accountant@novikovdom.test', role: 'ACCOUNTANT' },
    { email: 'parent@novikovdom.test', role: 'PARENT' },
  ]
  const passwordHash = await bcrypt.hash('password123', 10)

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, role: u.role, name: u.role },
      create: { email: u.email, passwordHash, role: u.role, name: u.role }
    })
  }

  // Minimal company/branch/group hierarchy
  let group = await prisma.group.findFirst()
  if (!group) {
    const company = await prisma.company.create({ data: { name: 'Demo Company' } })
    const branch = await prisma.branch.create({ data: { name: 'Main Branch', companyId: company.id, address: '—' } })
    group = await prisma.group.create({ data: { name: 'General', branchId: branch.id } })
  }

  // Create parent entity and child
  const parentUser = await prisma.user.findUnique({ where: { email: 'parent@novikovdom.test' } })
  let parent = null
  if (parentUser) {
    parent = await prisma.parent.upsert({
      where: { userId: parentUser.id },
      update: {},
      create: { userId: parentUser.id },
    })
  }
  let child = null
  if (parent) {
    child = await prisma.child.upsert({
      where: { id: (await prisma.child.findFirst({ where: { parentId: parent.id } }))?.id || '___none___' },
      update: {},
      create: {
        parentId: parent.id,
        firstName: 'Иван',
        lastName: 'Иванов',
        diagnosis: 'ФФНР',
        allowSelfEnroll: true,
        rateLesson: 1500,
        rateConsultation: 2000,
      },
    }).catch(async () => {
      return prisma.child.create({
        data: {
          parentId: parent.id,
          firstName: 'Иван',
          lastName: 'Иванов',
          diagnosis: 'ФФНР',
          allowSelfEnroll: true,
          rateLesson: 1500,
          rateConsultation: 2000,
        },
      })
    })
  }

  // Lessons for the current week
  const now = new Date()
  const day = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day - 1))
  monday.setHours(0, 0, 0, 0)
  for (let i = 0; i < 3; i++) {
    const start = new Date(monday)
    start.setDate(monday.getDate() + i)
    start.setHours(10 + i, 0, 0, 0)
    const end = new Date(start)
    end.setHours(start.getHours(), 45, 0, 0)
    await prisma.lesson.create({
      data: { title: `Занятие ${i + 1}`, startsAt: start, endsAt: end, groupId: group.id },
    }).catch(() => {})
  }

  // Work template and blocked time for logoped
  const logoped = await prisma.user.findUnique({ where: { email: 'logoped@novikovdom.test' } })
  if (logoped) {
    try {
      await prisma.workTemplate.createMany({
        data: [
          { userId: logoped.id, dayOfWeek: 1, startMinutes: 10 * 60, endMinutes: 11 * 60 },
          { userId: logoped.id, dayOfWeek: 3, startMinutes: 12 * 60, endMinutes: 13 * 60 },
        ],
        skipDuplicates: true,
      })
    } catch {}
    try {
      const btStart = new Date(monday)
      btStart.setDate(monday.getDate() + 2)
      btStart.setHours(15, 0, 0, 0)
      const btEnd = new Date(btStart)
      btEnd.setHours(16, 0, 0, 0)
      await prisma.blockedTime.create({ data: { userId: logoped.id, startsAt: btStart, endsAt: btEnd, reason: 'Личный приём' } })
    } catch {}
  }

  // Progress and rewards for the child
  if (child) {
    try {
      await prisma.progressEntry.createMany({
        data: [
          { childId: child.id, score: 3, note: 'Хорошее внимание' },
          { childId: child.id, score: 5, note: 'Отличная артикуляция' },
        ],
      })
    } catch {}
    try {
      await prisma.childReward.createMany({
        data: [
          { childId: child.id, kind: 'star', title: 'Усилие' },
          { childId: child.id, kind: 'medal', title: 'Прогресс недели' },
        ],
      })
    } catch {}
  }

  console.log('Seed completed. Test users created. Password: password123')
}

main().finally(async () => {
  await prisma.$disconnect()
})
