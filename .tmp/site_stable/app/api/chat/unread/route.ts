import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { countTotalUnread } from '@/app/chat/chatService'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ unread: 0 }, { status: 200 })
  const me = (session.user as any).id as string
  const unread = await countTotalUnread(me)
  return NextResponse.json({ unread })
}
