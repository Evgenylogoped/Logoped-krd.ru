import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { countTotalUnread } from '@/app/chat/chatService'

export const revalidate = 0
export const dynamic = 'force-dynamic'

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 200): Promise<T> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      if (i === attempts - 1) break
      await new Promise(r => setTimeout(r, delayMs))
      delayMs = Math.min(delayMs * 2, 1500)
    }
  }
  throw lastErr
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ unread: 0 }, { status: 200 })
  const me = (session.user as any).id as string
  const unread = await withRetry(() => countTotalUnread(me))
  return NextResponse.json({ unread })
}
