import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string
  const conv = await (prisma as any).conversation.findFirst({ where: { id: conversationId, participants: { some: { userId } } }, include: { participants: true } })
  if (!conv) return new Response('Not found', { status: 404 })

  const { searchParams } = new URL(req.url)
  let since = Number(searchParams.get('since') || 0)
  let sinceDate = since ? new Date(since) : null

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      function send(obj: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }
      let alive = true
      const timer = setInterval(async () => {
        if (!alive) return
        try {
          const now = Date.now()
          const msgs = await (prisma as any).message.findMany({
            where: {
              conversationId,
              ...(sinceDate ? {
                OR: [
                  { createdAt: { gt: sinceDate } },
                  { editedAt: { gt: sinceDate } },
                  { deletedAt: { gt: sinceDate } },
                ]
              } : {}),
            },
            orderBy: { createdAt: 'asc' },
            take: 200,
          })
          if (msgs.length > 0) {
            let latest = 0
            for (const m of msgs) {
              latest = Math.max(latest,
                new Date(m.createdAt).getTime(),
                m.editedAt ? new Date(m.editedAt).getTime() : 0,
                m.deletedAt ? new Date(m.deletedAt).getTime() : 0,
              )
            }
            if (latest > 0) {
              sinceDate = new Date(latest)
              since = latest
            }
          }
          const me = conv.participants.find((p: any) => p.userId === userId)
          const others = conv.participants.filter((p: any) => p.userId !== userId)
          const typingUsers = others.filter((p: any) => p.typingUntil && new Date(p.typingUntil).getTime() > now).map((p: any) => p.userId)
          const maxOtherReadAt = others.reduce((acc: number, p: any) => {
            const t = p.lastReadAt ? new Date(p.lastReadAt).getTime() : 0
            return Math.max(acc, t)
          }, 0)
          send({ messages: msgs, typingUsers, serverTime: now, lastReadAt: me?.lastReadAt || null, maxOtherReadAt: maxOtherReadAt || null })
        } catch (e) {
          // swallow errors, client may reconnect
        }
      }, 1000)

      // heartbeat
      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`))
        } catch {}
      }, 15000)

      // Close handling
      // Note: Next doesn't expose close signal; rely on GC or client disconnect exceptions
      controller.enqueue(encoder.encode(`retry: 2000\n\n`))

      return () => { alive = false; clearInterval(timer); clearInterval(hb) }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
