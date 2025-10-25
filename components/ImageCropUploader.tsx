"use client"
import React, { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  action: (formData: FormData) => void | Promise<void>
  defaultImageUrl?: string | null
  hiddenFields?: Record<string, string>
  label?: string
  // viewport in px and aspect ratio to crop
  viewportWidth?: number
  viewportHeight?: number
  outputWidth?: number
  outputHeight?: number
  buttonPickText?: string
  buttonAltPickText?: string
  outputMime?: 'image/jpeg' | 'image/png' | 'image/webp'
  circleMask?: boolean
}

export default function ImageCropUploader({ action, defaultImageUrl, hiddenFields, label, viewportWidth=300, viewportHeight=300, outputWidth=600, outputHeight=600, buttonPickText='Загрузить', buttonAltPickText='Загрузить без обрезки', outputMime='image/jpeg', circleMask=false }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const altInputRef = useRef<HTMLInputElement>(null)

  const [mounted, setMounted] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState<{w:number,h:number}>({w:0,h:0})
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{active:boolean,startX:number,startY:number,startOffX:number,startOffY:number}>({active:false,startX:0,startY:0,startOffX:0,startOffY:0})

  useEffect(()=>{ setMounted(true) },[])

  function onPickClick(){ fileInputRef.current?.click() }
  function onAltPick(){ altInputRef.current?.click() }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    setImageSrc(url)
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setNatural({ w: im.naturalWidth, h: im.naturalHeight })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setModalOpen(true)
    }
    im.src = url
  }

  function baselineScale(){
    if (!natural.w || !natural.h) return 1
    const sx = viewportWidth / natural.w
    const sy = viewportHeight / natural.h
    return Math.max(sx, sy)
  }
  const currentScale = baselineScale() * zoom
  const displayW = natural.w * currentScale
  const displayH = natural.h * currentScale
  const baseLeft = (viewportWidth - displayW) / 2
  const baseTop = (viewportHeight - displayH) / 2
  const left = baseLeft + offset.x
  const top = baseTop + offset.y

  function onMouseDown(e: React.MouseEvent){ setDrag({active:true,startX:e.clientX,startY:e.clientY,startOffX:offset.x,startOffY:offset.y}) }
  function onMouseMove(e: React.MouseEvent){ if(!drag.active) return; const dx=e.clientX-drag.startX; const dy=e.clientY-drag.startY; setOffset({ x: drag.startOffX + dx, y: drag.startOffY + dy }) }
  function onMouseUp(){ setDrag(p=>({...p,active:false})) }

  async function submitCropped(blob: Blob){
    const ext = outputMime==='image/png'?'png':(outputMime==='image/webp'?'webp':'jpg')
    const file = new File([blob], `image.${ext}`, { type: outputMime })
    if (formRef.current && fileInputRef.current) {
      setSaving(true)
      try {
        const dt = new DataTransfer()
        dt.items.add(file)
        fileInputRef.current.files = dt.files
      } catch {
        // DataTransfer may be unavailable; fallback: create a new input and replace
        const input = document.createElement('input')
        input.type = 'file'
        const dt2 = new DataTransfer()
        dt2.items.add(file)
        input.files = dt2.files
        fileInputRef.current.replaceWith(input)
        // rebind ref
        // @ts-ignore
        fileInputRef.current = input
      }
      formRef.current.requestSubmit()
      setSaving(false)
    }
  }

  async function onSave(){
    if (!img) return
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const ctx = canvas.getContext('2d')!

    const sx = Math.max(0, -left) * (natural.w / displayW)
    const sy = Math.max(0, -top) * (natural.h / displayH)
    const sWidth = Math.min(displayW, viewportWidth - Math.max(0, left)) * (natural.w / displayW)
    const sHeight = Math.min(displayH, viewportHeight - Math.max(0, top)) * (natural.h / displayH)

    // optional circular mask
    if (circleMask) {
      ctx.save()
      const r = Math.min(outputWidth, outputHeight) / 2
      ctx.beginPath()
      ctx.arc(outputWidth/2, outputHeight/2, r, 0, Math.PI*2)
      ctx.closePath()
      ctx.clip()
    } else {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0,0,outputWidth,outputHeight)
    }
    ctx.drawImage(img, sx, sy, Math.max(1, sWidth), Math.max(1, sHeight), 0, 0, outputWidth, outputHeight)
    if (circleMask) ctx.restore()

    canvas.toBlob(async (blob)=>{
      if (blob) return await submitCropped(blob)
      // Fallback via dataURL if toBlob is null
      try {
        const dataUrl = canvas.toDataURL(outputMime, 0.95)
        const res = await fetch(dataUrl)
        const b = await res.blob()
        await submitCropped(b)
      } catch {}
    }, outputMime, 0.95)
    setModalOpen(false)
  }

  return (
    <div className="space-y-2">
      {label && <div className="text-xs text-muted">{label}</div>}
      <div className={"w-28 h-28 overflow-hidden border bg-gray-50 " + (circleMask ? 'rounded-full' : 'rounded-lg')}>
        {defaultImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={defaultImageUrl} alt="prev" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Нет изображения</div>
        )}
      </div>

      {/* Hidden form for server action */}
      <form ref={formRef as any} action={action as any} className="hidden">
        {Object.entries(hiddenFields || {}).map(([k,v])=> (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input ref={fileInputRef} name="file" type="file" accept="image/*" onChange={onFileChange} />
      </form>

      <div className="flex gap-2 items-center">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onPickClick} disabled={saving}>{saving ? 'Сохранение…' : buttonPickText}</button>
        <input ref={altInputRef} type="file" className="hidden" accept="image/*" onChange={(e)=>{
          const f = e.target.files?.[0]; if(!f) return; if(formRef.current && fileInputRef.current){ const dt = new DataTransfer(); dt.items.add(f); fileInputRef.current.files = dt.files; formRef.current.requestSubmit() }
        }} />
        <button type="button" className="btn btn-outline btn-sm" onClick={()=>altInputRef.current?.click()} disabled={saving}>{buttonAltPickText}</button>
      </div>

      {mounted && modalOpen && (
        <div className="fixed inset-0 z-[1000] flex">
          <div className="flex-1 bg-black/40" onClick={()=>setModalOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-xl p-4 overflow-auto">
            <div className="text-lg font-semibold mb-3">Редактирование</div>
            <div
              className="relative border rounded"
              style={{ width: viewportWidth, height: viewportHeight, overflow: 'hidden', margin: '0 auto', userSelect: 'none', cursor: drag.active ? 'grabbing' : 'grab', touchAction: 'none' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            >
              {imageSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageSrc}
                  alt="preview"
                  style={{ position: 'absolute', transform: `translate(${left}px, ${top}px) scale(${currentScale})`, transformOrigin: 'top left', width: natural.w, height: natural.h, maxWidth: 'none', maxHeight: 'none', display: 'block', willChange: 'transform' }}
                  draggable={false}
                  onWheel={(e)=>{ e.preventDefault(); const delta = Math.sign(e.deltaY); setZoom(z => Math.min(3, Math.max(1, z + (delta>0?-0.05:0.05)))) }}
                  onTouchStart={(e)=>{ if(e.touches.length===1){ const t=e.touches[0]; setDrag({active:true,startX:t.clientX,startY:t.clientY,startOffX:offset.x,startOffY:offset.y}) } }}
                  onTouchMove={(e)=>{ if(e.touches.length===1 && drag.active){ e.preventDefault(); const t=e.touches[0]; const dx=t.clientX-drag.startX; const dy=t.clientY-drag.startY; setOffset({ x: drag.startOffX + dx, y: drag.startOffY + dy }) } }}
                  onTouchEnd={()=> setDrag(p=>({...p,active:false})) }
                />
              )}
            </div>
            <div className="mt-3 grid gap-2">
              <label className="text-sm">Масштаб: {zoom.toFixed(2)}x</label>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e=>setZoom(Number(e.target.value))} />
              <div className="flex gap-2 justify-end mt-2">
                <button className="btn btn-outline" type="button" onClick={()=>setModalOpen(false)}>Отмена</button>
                <button className="btn btn-primary" type="button" onClick={onSave}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
