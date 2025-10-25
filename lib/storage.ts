import { prisma } from '@/lib/prisma'
import { getUserPlan, getLimits } from '@/lib/subscriptions'
import path from 'path'
import { promises as fs } from 'fs'

export async function getLogopedSubscriptionLimitMb(logopedId: string): Promise<number> {
  const plan = await getUserPlan(logopedId)
  const lim = await getLimits(plan)
  // mediaMB already in megabytes (decimal 1000‑base)
  return Math.max(0, Number(lim.mediaMB || 0))
}

async function safeStatSize(absPath: string): Promise<number> {
  try { const s = await fs.stat(absPath); return s.isFile() ? s.size : 0 } catch { return 0 }
}

async function folderSize(absDir: string): Promise<number> {
  try {
    const ents = await fs.readdir(absDir, { withFileTypes: true })
    let sum = 0
    for (const e of ents) {
      const p = path.join(absDir, e.name)
      if (e.isDirectory()) sum += await folderSize(p)
      else if (e.isFile()) sum += await safeStatSize(p)
    }
    return sum
  } catch { return 0 }
}

function publicPathFromUrl(u: string): string | null {
  if (!u) return null
  if (!u.startsWith('/')) return null
  return path.join(process.cwd(), 'public', u.replace(/^\/+/, ''))
}

// Sum of materials (documents) for all children attached to the logoped and their parents
export async function getMaterialsBytesForLogoped(logopedId: string): Promise<number> {
  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { child: { logopedId } },
        { parent: { children: { some: { logopedId } } } },
      ],
    },
    select: { url: true },
    take: 5000,
  })
  let sum = 0
  for (const d of docs) {
    const p = publicPathFromUrl(d.url)
    if (p) sum += await safeStatSize(p)
  }
  return sum
}

// Sum of chat uploads for group/1:1 conversations where logoped or his parents participate
export async function getChatBytesForLogoped(logopedId: string): Promise<number> {
  // Find all parent userIds attached to this logoped
  const parents = await prisma.parent.findMany({
    where: { children: { some: { logopedId } } },
    select: { userId: true },
    take: 5000,
  })
  const userIds = [logopedId, ...parents.map(p=>p.userId)]
  // Conversations that include any of these users
  const convs = await prisma.conversationParticipant.findMany({
    where: { userId: { in: userIds } },
    select: { conversationId: true },
    take: 10000,
  })
  const convIds = Array.from(new Set(convs.map((c)=>c.conversationId)))
  let sum = 0
  for (const id of convIds) {
    const dir = path.join(process.cwd(), 'public', 'uploads', 'chat', id)
    sum += await folderSize(dir)
  }
  return sum
}

export async function getStorageUsageMb(logopedId: string): Promise<number> {
  const [m, c] = await Promise.all([
    getMaterialsBytesForLogoped(logopedId),
    getChatBytesForLogoped(logopedId),
  ])
  return (m + c) / (1024*1024)
}

export async function canUpload(logopedId: string, incomingSizeBytes: number): Promise<{ ok: boolean; usedMb: number; limitMb: number }> {
  const [limitMb, usedMb] = await Promise.all([
    getLogopedSubscriptionLimitMb(logopedId),
    getStorageUsageMb(logopedId),
  ])
  if (limitMb <= 0) return { ok: false, usedMb, limitMb }
  const nextMb = usedMb + (incomingSizeBytes / (1024*1024))
  return { ok: nextMb <= limitMb, usedMb, limitMb }
}

// Purge oldest materials for the logoped until the specified free space appears (best-effort)
export async function purgeOldMaterialsForLogoped(logopedId: string): Promise<number> {
  // delete documents older than 30 days
  const olderThan = new Date(Date.now() - 30*24*60*60*1000)
  const docs = await prisma.document.findMany({
    where: {
      createdAt: { lt: olderThan },
      OR: [ { child: { logopedId } }, { parent: { children: { some: { logopedId } } } } ],
    },
    select: { id: true, url: true },
    take: 1000,
  })
  let freed = 0
  for (const d of docs) {
    const p = publicPathFromUrl(d.url)
    if (p) {
      try { const s = await fs.stat(p); await fs.unlink(p); if (s.isFile()) freed += s.size } catch {}
    }
    await prisma.document.delete({ where: { id: d.id } }).catch(()=>{})
  }
  return freed
}

export async function purgeOldChatForLogoped(logopedId: string): Promise<number> {
  // delete chat files older than 30 days within related conversations
  const olderThan = Date.now() - 30*24*60*60*1000
  const parents = await prisma.parent.findMany({ where: { children: { some: { logopedId } } }, select: { userId: true } })
  const userIds = [logopedId, ...parents.map(p=>p.userId)]
  const convs = await prisma.conversationParticipant.findMany({ where: { userId: { in: userIds } }, select: { conversationId: true } })
  const convIds = Array.from(new Set(convs.map((c)=>c.conversationId)))
  let freed = 0
  for (const id of convIds) {
    const dir = path.join(process.cwd(), 'public', 'uploads', 'chat', id)
    try {
      const ents = await fs.readdir(dir, { withFileTypes: true })
      for (const e of ents) {
        const p = path.join(dir, e.name)
        try {
          const st = await fs.stat(p)
          if (st.isFile() && st.mtime.getTime() < olderThan) { await fs.unlink(p); freed += st.size }
        } catch {}
      }
    } catch {}
  }
  return freed
}
