#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const amount = Number(process.env.AMOUNT || 0)
  const kind = String(process.env.KIND || 'PAYOUT')
  const fromIso = process.env.FROM_ISO
  const toIso = process.env.TO_ISO
  if (!amount || !fromIso || !toIso) {
    console.error('Usage: AMOUNT=600 KIND=PAYOUT FROM_ISO=2025-10-13T19:58:00Z TO_ISO=2025-10-13T20:00:00Z node scripts/delete_tx_by_amount_window.js')
    process.exit(1)
  }
  const where = {
    kind,
    amount,
    createdAt: { gte: new Date(fromIso), lte: new Date(toIso) },
  }
  const found = await prisma.transaction.findMany({ where, select: { id: true, userId: true, amount: true, createdAt: true, kind: true } })
  if (!found.length) {
    console.log('No matching transactions found for deletion.')
    return
  }
  console.log('Will delete the following transactions:')
  for (const t of found) {
    console.log(`- id=${t.id} userId=${t.userId} kind=${t.kind} amount=${t.amount} createdAt=${t.createdAt.toISOString()}`)
  }
  if (String(process.env.RUN_DELETE || '').trim() !== '1') {
    console.log('Set RUN_DELETE=1 to actually delete them.')
    return
  }
  const ids = found.map(f => f.id)
  const res = await prisma.transaction.deleteMany({ where: { id: { in: ids } } })
  console.log(`Deleted ${res.count} transactions.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(async ()=> { await prisma.$disconnect() })
