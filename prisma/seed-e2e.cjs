#!/usr/bin/env node
/*
  Simple E2E seed: creates admin and user accounts with predictable credentials,
  and a couple of subscriptions for testing flows.
*/
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  // Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin+e2e@example.com' },
    update: { role: 'ADMIN', passwordHash: passwordHash, name: 'Admin E2E' },
    create: { email: 'admin+e2e@example.com', role: 'ADMIN', passwordHash: passwordHash, name: 'Admin E2E' },
  })

  // Regular user
  const user = await prisma.user.upsert({
    where: { email: 'user+e2e@example.com' },
    update: { role: 'LOGOPED', passwordHash: passwordHash, name: 'User E2E' },
    create: { email: 'user+e2e@example.com', role: 'LOGOPED', passwordHash: passwordHash, name: 'User E2E' },
  })

  // Secondary user specifically for org-requests flows (kept outside any organization)
  const user2 = await prisma.user.upsert({
    where: { email: 'user2+e2e@example.com' },
    update: { role: 'LOGOPED', passwordHash: passwordHash, name: 'User2 E2E', branchId: null },
    create: { email: 'user2+e2e@example.com', role: 'LOGOPED', passwordHash: passwordHash, name: 'User2 E2E' },
  })

  // Third user for reject flow isolation
  const user3 = await prisma.user.upsert({
    where: { email: 'user3+e2e@example.com' },
    update: { role: 'LOGOPED', passwordHash: passwordHash, name: 'User3 E2E', branchId: null },
    create: { email: 'user3+e2e@example.com', role: 'LOGOPED', passwordHash: passwordHash, name: 'User3 E2E' },
  })

  // Seed a recent subscription for the user
  const now = new Date()
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date(now.getTime() - 3*24*60*60*1000),
      currentPeriodEnd: new Date(now.getTime() + 27*24*60*60*1000),
    }
  })

  console.log('E2E seed done:', { admin: admin.email, user: user.email, user2: user2.email, user3: user3.email })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
