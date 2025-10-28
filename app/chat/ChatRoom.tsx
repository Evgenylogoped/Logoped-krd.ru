"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import VipBadge from '@/components/VipBadge'
import { sendMessageAction, setTyping, markRead, markReadOnFocus, reactMessage, editMessage, deleteMessage } from './actions'

type Message = {
  id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
  replyToId?: string | null
  type?: string
  attachmentUrl?: string | null
  editedAt?: string | null
  deletedAt?: string | null
  reactionsJson?: Record<string, number> | null
}

export default function ChatRoom({ conversationId, selfId, initialMessages, childInfo, backgroundColor, backgroundUrl, participants }: { conversationId: string; selfId: string; initialMessages: Message[]; childInfo?: { id: string; name: string; image?: string | null }; backgroundColor?: string | null; backgroundUrl?: string | null; participants?: { id: string; name?: string | null; email?: string | null; featured?: boolean | null; featuredSuper?: boolean | null }[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [attachUrl, setAttachUrl] = useState('')
  const [attachLoaded, setAttachLoaded] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [serverTime, setServerTime] = useState<number>(Date.now())
  const [otherReadTs, setOtherReadTs] = useState<number>(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sinceRef = useRef<number>(initialMessages.length ? new Date(initialMessages[initialMessages.length - 1].createdAt).getTime() : 0)
  const [ctx, setCtx] = useState<{ open: boolean; x: number; y: number; msg?: Message | null }>({ open: false, x: 0, y: 0, msg: null })

  useEffect(() => { scrollToBottom() }, [])
  useEffect(() => { scrollToBottom() }, [messages])
  useEffect(() => {
    function onFocus() { markReadOnFocus(conversationId).catch(()=>{}) }
    window.addEventListener('focus', onFocus)
    onFocus()
    return () => window.removeEventListener('focus', onFocus)
  }, [conversationId])

  function mergeIncoming(incoming: Message[]) {
    if (!incoming || incoming.length === 0) return
    setMessages(prev => {
      const map = new Map<string, Message>()
      for (const m of prev) map.set(m.id, m)
      for (const m of incoming) map.set(m.id, m) // заменяем существующие версии
      const arr = Array.from(map.values())
      arr.sort((a,b)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      return arr
    })
  }

  async function poll() {
    try {
      const since = sinceRef.current ? `?since=${sinceRef.current}` : ''
      const r = await fetch(`/api/chat/${conversationId}/messages${since}`, { cache: 'no-store' })
      if (r.ok) {
        const j = await r.json()
        if (Array.isArray(j.messages) && j.messages.length > 0) mergeIncoming(j.messages)
        if (Array.isArray(j.messages) && j.messages.length > 0) await markRead(conversationId)
        if (Array.isArray(j.typingUsers)) setTypingUsers(j.typingUsers)
        if (j.maxOtherReadAt) setOtherReadTs(Number(j.maxOtherReadAt))
        if (j.serverTime) { setServerTime(j.serverTime); sinceRef.current = Number(j.serverTime) }
      }
    } catch {}
  }

  useEffect(() => {
    // Попытка установить SSE канал; при ошибке — поллинг
    let es: EventSource | null = null
    let pollTimer: any = null
    try {
      const since = sinceRef.current ? `?since=${sinceRef.current}` : ''
      es = new EventSource(`/api/chat/${conversationId}/events${since}`)
      es.onmessage = async (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (Array.isArray(data.messages) && data.messages.length > 0) mergeIncoming(data.messages)
          if (Array.isArray(data.messages) && data.messages.length > 0) await markRead(conversationId)
          if (Array.isArray(data.typingUsers)) setTypingUsers(data.typingUsers)
          if (data.maxOtherReadAt) setOtherReadTs(Number(data.maxOtherReadAt))
          if (data.serverTime) { setServerTime(data.serverTime); sinceRef.current = Number(data.serverTime) }
        } catch {}
      }
      es.onerror = () => {
        // Fallback to polling
        es && es.close()
        pollTimer = setInterval(poll, 3000)
      }
    } catch {
      pollTimer = setInterval(poll, 3000)
    }
    return () => { es && es.close(); if (pollTimer) clearInterval(pollTimer) }
  }, [conversationId])

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    const url = attachUrl.trim()
    if (!text && !url) return
    setLoading(true)
    try {
      if (editId) {
        await editMessage(editId, text)
        setEditId(null)
      } else {
        const type = url ? (isImage(url) ? 'IMAGE' : (isVideo(url) ? 'VIDEO' : (isAudio(url) ? 'AUDIO' : (isPdf(url) ? 'PDF' : 'FILE')))) : 'TEXT'
        // оптимистическое сообщение
        const tempId = `temp-${Date.now()}`
        const optimistic: Message = { id: tempId, conversationId, authorId: selfId, body: text || (type!=='TEXT' ? (type==='IMAGE'?'[Изображение]': type==='VIDEO'?'[Видео]': type==='AUDIO'?'[Аудио]': type==='PDF'?'[PDF]':'[Файл]') : ''), createdAt: new Date().toISOString(), replyToId: replyTo?.id || null, type, attachmentUrl: url || null }
        setMessages(prev => [...prev, optimistic])
        try {
          const r = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ conversationId, body: optimistic.body, replyToId: optimistic.replyToId || null }),
            credentials: 'include',
          })
          if (!r.ok) {
            setMessages(prev => prev.filter(m => m.id !== tempId))
            const txt = await r.text().catch(()=> '')
            if (typeof window !== 'undefined') window.alert(txt || 'Не удалось отправить сообщение')
            return
          }
          const j = await r.json().catch(()=> ({} as any))
          const saved = (j as any).message || j
          // заменить оптимистическое сообщение на реальное БЕЗ изменения позиции/времени
          setMessages(prev => prev.map(m => m.id === tempId ? ({ ...(saved as any), createdAt: optimistic.createdAt }) : m))
        } catch (err) {
          // откат оптимистического сообщения на ошибке
          setMessages(prev => prev.filter(m => m.id !== tempId))
          const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as any).message || '') : String(err || '')
          if (typeof window !== 'undefined') {
            window.alert(msg || 'Не удалось отправить сообщение. Проверьте доступ и попробуйте ещё раз.')
          }
          return
        }
      }
      setInput('')
      setAttachUrl('')
      setAttachLoaded(false)
      setReplyTo(null)
      await poll()
    } finally {
      setLoading(false)
    }
  }

  function isImage(u: string) { return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)(\?.*)?$/i.test(u) }
  function isVideo(u: string) { return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(u) }
  function isAudio(u: string) { return /\.(mp3|m4a|aac|ogg|wav)(\?.*)?$/i.test(u) }
  function isPdf(u: string) { return /\.(pdf)(\?.*)?$/i.test(u) }
  function isOffice(u: string) { return /\.(docx?|xlsx?|pptx?)(\?.*)?$/i.test(u) }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      if (r.ok) {
        const j = await r.json()
        if (j.url) setAttachUrl(j.url as string)
      }
    } finally {
      e.target.value = ''
    }
  }

  const pMap = useMemo(() => {
    const map = new Map<string, { id: string; name?: string | null; email?: string | null; featured?: boolean | null; featuredSuper?: boolean | null }>()
    for (const p of (participants || [])) map.set(p.id, p)
    return map
  }, [participants])

  function MessageBubble({ m }: { m: Message }) {
    const mine = m.authorId === selfId
    const author = pMap.get(m.authorId)
    const authorName = mine ? 'Вы' : (author?.name || author?.email || 'Пользователь')
    const isDel = Boolean(m.deletedAt)
    const reactions = m.reactionsJson || {}
    const openCtx = (e: React.MouseEvent) => {
      e.preventDefault()
      setCtx({ open: true, x: e.clientX, y: e.clientY, msg: m })
    }
    const body = (
      <>
        {/* Автор сообщения */}
        <div className="text-[11px] font-medium mb-0.5 flex items-center gap-1" style={{ color: mine ? '#075E54' : '#0b1a2b' }}>
          <span>{authorName}</span>
          {!mine && (author?.featuredSuper || author?.featured) && (
            <VipBadge level={author?.featuredSuper ? 'VIP+' : 'VIP'} />
          )}
        </div>
        {!isDel && m.replyToId ? (
          <div className="text-[10px] opacity-70 border-l-2 pl-2 mb-1">Ответ на сообщение</div>
        ) : null}
        <div className="whitespace-pre-wrap text-sm leading-snug">{isDel ? 'Сообщение удалено' : m.body}</div>
        {m.attachmentUrl && (
          isImage(m.attachmentUrl) ? (
            <a href={m.attachmentUrl} target="_blank" className="block mt-2">
              <div className="rounded overflow-hidden" style={{ minHeight: '12rem', maxHeight: '12rem' }}>
                <img src={m.attachmentUrl} alt="img" className="h-48 w-auto max-w-full object-contain" />
              </div>
            </a>
          ) : isVideo(m.attachmentUrl) ? (
            <video className="block mt-2 h-48 max-w-full rounded" controls preload="metadata" src={m.attachmentUrl} />
          ) : isAudio(m.attachmentUrl) ? (
            <audio className="block mt-2 w-64" controls src={m.attachmentUrl} />
          ) : isPdf(m.attachmentUrl) ? (
            <a href={m.attachmentUrl} target="_blank" className="block mt-2 text-xs underline">Открыть PDF</a>
          ) : (
            <a href={m.attachmentUrl} target="_blank" className="block mt-2 text-xs underline">Скачать файл</a>
          )
        )}
        <div className="mt-1 text-[10px] flex items-center justify-end gap-1">
          <span className="opacity-70">{new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}{m.editedAt ? ' · изменено' : ''}</span>
          {mine && (() => {
            const read = new Date(m.createdAt).getTime() <= otherReadTs
            return read ? (
              <span className="inline-flex items-center gap-0.5" aria-label="Прочитано">
                <span style={{ color: '#34B7F1' }}>✓</span>
                <span style={{ color: '#34B7F1' }}>✓</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 opacity-70" aria-label="Отправлено">
                <span>✓</span>
              </span>
            )
          })()}
        </div>
        {/* Показ реакций под сообщением */}
        {Object.keys(reactions).length > 0 && (
          <div className="mt-1 flex gap-2 text-[11px]">
            {Object.entries(reactions).map(([emo, cnt]) => (
              cnt > 0 ? <span key={emo} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/5">
                <span>{emo}</span>
                <span className="text-[10px] opacity-70">{cnt}</span>
              </span> : null
            ))}
          </div>
        )}
      </>
    )
    return (
      <div className={`max-w-[82%] ${mine ? 'ml-auto' : ''}`} onContextMenu={openCtx}>
        <div
          className={"inline-block px-3 py-2 rounded-2xl " + (mine ? 'rounded-br-sm' : 'rounded-bl-sm')}
          style={mine ? { background: '#DCF8C6', color: '#111' } : { background: '#fff', color: '#111', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          {body}
        </div>
      </div>
    )
  }
let typingLabel = typingUsers.length > 0 ? 'Печатает...' : ''

  const bgStyle: React.CSSProperties = backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: backgroundColor || '#ECE5DD' }
  return (
    <div className="relative flex flex-col h-[calc(100vh-160px)] border rounded">
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={bgStyle} onClick={()=> setCtx({open:false, x:0, y:0, msg:null})}>
        {messages.map(m => (
          <MessageBubble key={m.id} m={m} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-2" >
        {replyTo && (
          <div className="mb-2 text-xs border rounded p-2 flex items-center justify-between" style={{ background: 'var(--card-bg)' }}>
            <div>
              Ответ на сообщение: <span className="opacity-70">{replyTo.body.slice(0,80)}</span>
            </div>
          </div>
        )}
        {typingLabel && <div className="text-xs text-muted mb-1">{typingLabel}</div>}
        <form onSubmit={onSend} className="flex flex-col gap-2">
          <div className="flex gap-2 items-end">
            <input
              value={input}
              onChange={async (e) => { setInput(e.target.value); try { await setTyping(conversationId, 2000) } catch {} }}
              className="input flex-1"
              placeholder={editId ? 'Редактирование сообщения...' : 'Напишите сообщение...'}
              name="message"
              id="chat-message"
            />
            <label className="btn btn-secondary cursor-pointer">
              Файл
              <input type="file" className="hidden" onChange={onPickFile} name="file" id="chat-file" />
            </label>
            <button disabled={loading} className="btn btn-primary">{editId ? 'Сохранить' : 'Отправить'}</button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <input value={attachUrl} onChange={(e)=>{ setAttachUrl(e.target.value); setAttachLoaded(false); }} className="input flex-1" placeholder="Ссылка на файл/изображение/видео (опц.)" name="attachmentUrl" id="chat-attachment-url" />
              {attachUrl && (
                isImage(attachUrl) ? <span className="text-xs">Изображение</span>
                : isVideo(attachUrl) ? <span className="text-xs">Видео</span>
                : isAudio(attachUrl) ? <span className="text-xs">Аудио</span>
                : isPdf(attachUrl) ? <span className="text-xs">PDF</span>
                : isOffice(attachUrl) ? <span className="text-xs">Документ</span>
                : <span className="text-xs">Файл</span>
              )}
            </div>
            {attachUrl && (
              <div className="flex items-center gap-3 p-2 rounded border bg-white/70">
                {isImage(attachUrl) ? (
                  <div className="h-16 w-24 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                    <img src={attachUrl} alt="preview" className="h-16 w-auto object-contain" onLoad={()=> setAttachLoaded(true)} />
                  </div>
                ) : isVideo(attachUrl) ? (
                  <div className="h-16 w-28 bg-gray-100 rounded flex items-center justify-center text-[10px]">Видео</div>
                ) : isAudio(attachUrl) ? (
                  <div className="h-10 w-40"><audio controls src={attachUrl} /></div>
                ) : isPdf(attachUrl) ? (
                  <span className="text-xs break-all">PDF: {attachUrl}</span>
                ) : (
                  <span className="text-xs break-all">{attachUrl}</span>
                )}
                <button type="button" className="btn btn-xs" onClick={()=> { setAttachUrl(''); setAttachLoaded(false); }}>Удалить вложение</button>
              </div>
            )}
          </div>
        </form>
      </div>
      {ctx.open && ctx.msg && (
        <div className="absolute z-50 bg-white rounded-md border shadow-lg text-sm" style={{ left: Math.max(8, Math.min(ctx.x, window.innerWidth-180)), top: Math.max(8, Math.min(ctx.y, window.innerHeight-160)) }}>
          <div className="py-1">
            <button className="block w-full text-left px-3 py-1 hover:bg-gray-50" onClick={()=>{ setReplyTo(ctx.msg!); setCtx({open:false,x:0,y:0,msg:null}) }}>Ответить</button>
            <button className="block w-full text-left px-3 py-1 hover:bg-gray-50" onClick={async()=>{ await reactMessage(ctx.msg!.id, '👍'); setCtx({open:false,x:0,y:0,msg:null}); poll() }}>Поставить 👍</button>
            <button className="block w-full text-left px-3 py-1 hover:bg-gray-50" onClick={async()=>{ await reactMessage(ctx.msg!.id, '❤️'); setCtx({open:false,x:0,y:0,msg:null}); poll() }}>Поставить ❤️</button>
            {ctx.msg.authorId === selfId && (
              <>
                <button className="block w-full text-left px-3 py-1 hover:bg-gray-50" onClick={()=>{ setEditId(ctx.msg!.id); setInput(ctx.msg!.body); setCtx({open:false,x:0,y:0,msg:null}) }}>Редактировать</button>
                <button className="block w-full text-left px-3 py-1 hover:bg-gray-50 text-rose-600" onClick={async()=>{ await deleteMessage(ctx.msg!.id); setCtx({open:false,x:0,y:0,msg:null}); poll() }}>Удалить</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
