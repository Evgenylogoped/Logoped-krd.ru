"use client"
import React, { useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"

type Props = {
  childId: string
  action: string | ((formData: FormData) => void)
  defaultImageUrl?: string | null
}

export default function ChildPhotoUploader({ childId, action, defaultImageUrl }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const altInputRef = useRef<HTMLInputElement>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState<{w:number,h:number}>({w:0,h:0})
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{active:boolean, startX:number, startY:number, startOffX:number, startOffY:number}>({active:false,startX:0,startY:0,startOffX:0,startOffY:0})
  const [saving, setSaving] = useState(false)

  const viewport = 300 // px square
  const [mounted, setMounted] = useState(false)
  useEffect(()=>{ setMounted(true) },[])

  // prevent background scroll when modal open (mobile UX)
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    if (modalOpen) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [modalOpen, mounted])

  function onPickClick() {
    fileInputRef.current?.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    setImageSrc(url)
    const img = new Image()
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setImgEl(img)
      // reset position/zoom
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setModalOpen(true)
    }
    img.src = url
  }

  function baselineScale() {
    if (!natural.w || !natural.h) return 1
    return Math.max(viewport / natural.w, viewport / natural.h)
  }

  const currentScale = baselineScale() * zoom
  const displayW = natural.w * currentScale
  const displayH = natural.h * currentScale
  const baseLeft = (viewport - displayW) / 2
  const baseTop = (viewport - displayH) / 2
  const left = baseLeft + offset.x
  const top = baseTop + offset.y

  function onMouseDown(e: React.MouseEvent) {
    setDrag({active:true,startX:e.clientX,startY:e.clientY,startOffX:offset.x,startOffY:offset.y})
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.active) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    setOffset({ x: drag.startOffX + dx, y: drag.startOffY + dy })
  }
  function onMouseUp() {
    setDrag(prev => ({...prev, active:false}))
  }

  async function onSave() {
    if (!imgEl) return
    const outSize = 600
    const canvas = document.createElement('canvas')
    canvas.width = outSize
    canvas.height = outSize
    const ctx = canvas.getContext('2d')!
    // compute source rect from current transform
    const sx = Math.max(0, -left) * (natural.w / displayW)
    const sy = Math.max(0, -top) * (natural.h / displayH)
    const sWidth = Math.min(displayW, viewport - Math.max(0, left)) * (natural.w / displayW)
    const sHeight = Math.min(displayH, viewport - Math.max(0, top)) * (natural.h / displayH)

    // draw centered into canvas
    ctx.fillStyle = '#fff'
    ctx.fillRect(0,0,outSize,outSize)
    ctx.drawImage(
      imgEl,
      sx, sy, Math.max(1, sWidth), Math.max(1, sHeight),
      0, 0, outSize, outSize
    )

    return new Promise<void>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return resolve()
        const file = new File([blob], `child_${childId}_photo.jpg`, { type: 'image/jpeg' })
        // put into hidden file input via DataTransfer and submit form
        if (fileInputRef.current && formRef.current) {
          setSaving(true)
          const dt = new DataTransfer()
          dt.items.add(file)
          fileInputRef.current.files = dt.files
          formRef.current.requestSubmit()
        }
        setModalOpen(false)
        setSaving(false)
        resolve()
      }, 'image/jpeg', 0.9)
    })
  }

  function onAltPick() { altInputRef.current?.click() }
  function onAltChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (fileInputRef.current && formRef.current) {
      setSaving(true)
      const dt = new DataTransfer()
      dt.items.add(f)
      fileInputRef.current.files = dt.files
      formRef.current.requestSubmit()
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="w-28 h-28 rounded-lg overflow-hidden border bg-gray-50">
        {defaultImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={defaultImageUrl} alt="Фото" className="w-full h-full object-cover" onError={(e)=>{ (e.currentTarget as HTMLImageElement).src = '/avatar-child.svg'; if (typeof window!== 'undefined') window.dispatchEvent(new CustomEvent('app:toast',{ detail: 'Не удалось загрузить фото, показан плейсхолдер' })) }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Нет фото</div>
        )}
      </div>

      {/* Hidden form for server action submit */}
      <form ref={formRef as any} action={action as any} className="hidden">
        <input type="hidden" name="id" value={childId} />
        <input ref={fileInputRef} name="file" type="file" accept="image/*" onChange={onFileChange} />
      </form>

      <div className="flex gap-2 items-center">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onPickClick} disabled={saving}>{saving ? 'Сохранение…' : 'Загрузить фото'}</button>
        <input ref={altInputRef} type="file" className="hidden" accept="image/*" onChange={onAltChange} />
        <button type="button" className="btn btn-outline btn-sm" onClick={onAltPick} disabled={saving}>Загрузить без обрезки</button>
      </div>

      {/* Modal Cropper */}
      {mounted && modalOpen && createPortal(
        <div className="fixed inset-0 z-[1000] flex">
          <div className="flex-1 bg-black/40" onClick={()=>setModalOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-xl p-4 overflow-auto">
            <div className="text-lg font-semibold mb-3">Редактирование фото</div>
            <div
              className="relative border rounded"
              style={{ width: viewport, height: viewport, overflow: 'hidden', margin: '0 auto', userSelect: 'none', cursor: drag.active ? 'grabbing' : 'grab', touchAction: 'none' }}
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
                  onWheel={(e)=>{
                    e.preventDefault()
                    const delta = Math.sign(e.deltaY)
                    setZoom(z => Math.min(3, Math.max(1, z + (delta>0?-0.05:0.05))))
                  }}
                  onTouchStart={(e)=>{
                    if (e.touches.length===1) {
                      const t = e.touches[0]
                      setDrag({active:true,startX:t.clientX,startY:t.clientY,startOffX:offset.x,startOffY:offset.y})
                    } else if (e.touches.length===2) {
                      const dx = e.touches[0].clientX - e.touches[1].clientX
                      const dy = e.touches[0].clientY - e.touches[1].clientY
                      ;(e.currentTarget as any)._pinch = Math.hypot(dx,dy)
                    }
                  }}
                  onTouchMove={(e)=>{
                    if (e.touches.length===1 && drag.active) {
                      e.preventDefault()
                      const t = e.touches[0]
                      const dx = t.clientX - drag.startX
                      const dy = t.clientY - drag.startY
                      setOffset({ x: drag.startOffX + dx, y: drag.startOffY + dy })
                    } else if (e.touches.length===2) {
                      e.preventDefault()
                      const prev = (e.currentTarget as any)._pinch || 0
                      const dx = e.touches[0].clientX - e.touches[1].clientX
                      const dy = e.touches[0].clientY - e.touches[1].clientY
                      const cur = Math.hypot(dx,dy)
                      const diff = cur - prev
                      if (Math.abs(diff) > 2) {
                        setZoom(z => Math.min(3, Math.max(1, z + (diff>0?0.03:-0.03))))
                        ;(e.currentTarget as any)._pinch = cur
                      }
                    }
                  }}
                  onTouchEnd={(e)=>{
                    if (e.touches.length===0) setDrag(prev => ({...prev, active:false}))
                  }}
                />
              )}
            </div>
            <div className="mt-3 grid gap-2">
              <label className="text-sm">Масштаб: {zoom.toFixed(2)}x</label>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e=>setZoom(Number(e.target.value))} />
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-sm" onClick={()=>setZoom(z=>Math.max(1, Number((z-0.1).toFixed(2))))}>−</button>
                <button type="button" className="btn btn-sm" onClick={()=>setZoom(z=>Math.min(3, Number((z+0.1).toFixed(2))))}>+</button>
              </div>
              <div className="flex gap-2 justify-end mt-2">
                <button className="btn btn-outline" type="button" onClick={()=>setModalOpen(false)}>Отмена</button>
                <button className="btn btn-primary" type="button" onClick={()=>onSave()}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  )
}
