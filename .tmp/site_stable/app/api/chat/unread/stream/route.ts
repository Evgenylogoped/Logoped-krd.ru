 import { getServerSession } from 'next-auth'
 import { authOptions } from '@/lib/auth'
 import { countTotalUnread } from '@/app/chat/chatService'

 export const runtime = 'nodejs'
 export const dynamic = 'force-dynamic'

 export async function GET(req: Request) {
   const session = await getServerSession(authOptions)
   const me = (session?.user as any)?.id as string | undefined

   const encoder = new TextEncoder()
   let closed = false
   let interval: NodeJS.Timeout | undefined
   let keepAlive: NodeJS.Timeout | undefined

   const stream = new ReadableStream<Uint8Array>({
     async start(controller) {
       const safeEnqueue = (chunk: string) => {
         if (closed) return
         try {
           controller.enqueue(encoder.encode(chunk))
         } catch {
           // controller already closed
           closed = true
           if (interval) clearInterval(interval)
           if (keepAlive) clearInterval(keepAlive)
           try { controller.close() } catch {}
         }
       }

       const send = (event: string, data: any) => {
         safeEnqueue(`event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`)
       }

       // initial push
       try {
         const unread = me ? await countTotalUnread(me) : 0
         send('unread', { unread })
       } catch {
         send('unread', { unread: 0 })
       }

       // periodic updates
       interval = setInterval(async () => {
         if (closed) return
         try {
           const unread = me ? await countTotalUnread(me) : 0
           send('unread', { unread })
         } catch {}
       }, 12000)

       // keep-alive comments
       keepAlive = setInterval(() => {
         if (closed) return
         safeEnqueue(`: ping\n\n`)
       }, 15000)

       // abort/close handling
       const signal: AbortSignal | undefined = req?.signal || (globalThis as any)?.request?.signal
       if (signal) {
         signal.addEventListener('abort', () => {
           closed = true
           if (interval) clearInterval(interval)
           if (keepAlive) clearInterval(keepAlive)
           try { controller.close() } catch {}
         })
       }
     },
     cancel() {
       closed = true
       if (interval) clearInterval(interval)
       if (keepAlive) clearInterval(keepAlive)
     },
   })

   return new Response(stream, {
     headers: {
       'Content-Type': 'text/event-stream; charset=utf-8',
       'Cache-Control': 'no-cache, no-transform',
       'Connection': 'keep-alive',
     },
   })
 }
