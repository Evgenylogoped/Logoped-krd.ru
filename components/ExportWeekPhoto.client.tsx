"use client"

import React from "react"
import { createPortal } from 'react-dom'
import Image from 'next/image'
// dynamic import внутри обработчика клика

type Props = {
  targetSelector: string
  fileName: string // without extension
  header: {
    logoUrl?: string
    title: string // e.g. ФИО логопеда
    subtitle: string // диапазон дат недели
  }
}

export default function ExportWeekPhotoButton({ targetSelector, fileName, header }: Props) {
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)
  const [overlayUrl, setOverlayUrl] = React.useState<string | null>(null)

  function isIOS() {
    const ua = navigator.userAgent || navigator.vendor || ((window as unknown as { opera?: string }).opera ?? '')
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    return iOS
  }

  // removed unused isStandalonePWA

  async function shareOrSave(blob: Blob) {
    const file = new File([blob], `${fileName}.png`, { type: 'image/png' })
    const nav = navigator as Navigator & Partial<{ canShare: (data: ShareData) => boolean; share: (data: ShareData) => Promise<void> }>
    const canShareFiles = typeof nav.canShare === 'function' && nav.canShare({ files: [file] })
    const canShare = typeof nav.share === 'function' && canShareFiles

    // iOS Safari/PWA часто не сохраняет напрямую в Фото через download; лучший UX — открыть в новой вкладке
    if (isIOS()) {
      // 1) попробовать системный share, если доступен
      if (canShare && nav.share) {
        try {
          await nav.share({ files: [file], title: header.title, text: header.subtitle })
          setToast('Открыт системный шэринг')
          setTimeout(()=> setToast(null), 2000)
          return
        } catch {/* ignore, fallback below */}
      }
      // 2) открыть в новой вкладке/вьювере — далее «Поделиться» → «Сохранить изображение»
      const url = URL.createObjectURL(blob)
      // Встроенный просмотрщик, гарантированно работает в Safari/PWA
      setOverlayUrl(url)
      setToast('Удерживайте по картинке → «Сохранить изображение»')
      setTimeout(()=> setToast(null), 2500)
      return
    }

    // Android/desktop: сначала share, затем download
    if (canShare && nav.share) {
      try {
        await nav.share({ files: [file], title: header.title, text: header.subtitle })
        setToast('Открыт системный шэринг')
        setTimeout(()=> setToast(null), 2000)
        return
      } catch {/* user cancelled, fallback */}
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileName}.png`
    a.click()
    setTimeout(()=> URL.revokeObjectURL(url), 2000)
    setToast('Скачано')
    setTimeout(()=> setToast(null), 2000)
  }

  async function handleClick() {
    if (busy) return
    setBusy(true)
    let wrapper: HTMLDivElement | null = null
    try {
      const source = document.querySelector(targetSelector) as HTMLElement | null
      if (!source) {
        setToast('Не найден контейнер недели')
        setTimeout(()=> setToast(null), 2000)
        return
      }
      // Clone source
      const clone = source.cloneNode(true) as HTMLElement
      // Build export container
      wrapper = document.createElement('div') as HTMLDivElement
      wrapper.style.position = 'fixed'
      wrapper.style.left = '-99999px'
      wrapper.style.top = '0'
      wrapper.style.background = '#fff'
      wrapper.style.padding = '12px'
      wrapper.style.border = '1px solid #e5e7eb'
      wrapper.style.borderRadius = '8px'
      wrapper.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      wrapper.style.color = '#111827'

      // Header
      const headerEl = document.createElement('div')
      headerEl.style.display = 'flex'
      headerEl.style.alignItems = 'center'
      headerEl.style.justifyContent = 'space-between'
      headerEl.style.marginBottom = '10px'
      const left = document.createElement('div')
      left.style.display = 'flex'
      left.style.alignItems = 'center'
      left.style.gap = '10px'
      if (header.logoUrl) {
        const img = document.createElement('img')
        img.src = header.logoUrl
        img.alt = 'Logo'
        img.width = 28; img.height = 28
        img.style.objectFit = 'contain'
        img.referrerPolicy = 'no-referrer'
        left.appendChild(img)
      }
      const title = document.createElement('div')
      title.style.fontWeight = '600'
      title.style.fontSize = '14px'
      title.textContent = header.title
      const subtitle = document.createElement('div')
      subtitle.style.fontSize = '12px'
      subtitle.style.color = '#6b7280'
      subtitle.textContent = header.subtitle
      const textWrap = document.createElement('div')
      textWrap.appendChild(title)
      textWrap.appendChild(subtitle)
      left.appendChild(textWrap)
      headerEl.appendChild(left)
      wrapper.appendChild(headerEl)

      // Force horizontal layout: days in one row
      // Replace grid with flex-row no-wrap
      clone.style.display = 'flex'
      clone.style.flexDirection = 'row'
      clone.style.flexWrap = 'nowrap'
      clone.style.gap = '8px'
      // Remove images to avoid CORS/taint issues
      clone.querySelectorAll('img').forEach(el => el.parentElement?.removeChild(el))
      // Remove scripts/links/canvas/svg from clone
      clone.querySelectorAll('script,link,canvas,svg').forEach(el => el.parentElement?.removeChild(el))
      // Remove background-image styles
      clone.querySelectorAll<HTMLElement>('*').forEach(el => {
        const bg = window.getComputedStyle(el).backgroundImage
        if (bg && bg !== 'none' && bg.includes('url(')) {
          el.style.backgroundImage = 'none'
        }
        const color = window.getComputedStyle(el).color
        if (color && (color.includes('oklab') || color.includes('oklch') || color.includes('color-mix'))) {
          el.style.color = '#111827'
        }
        const bgColor = window.getComputedStyle(el).backgroundColor
        if (bgColor && (bgColor.includes('oklab') || bgColor.includes('oklch') || bgColor.includes('color-mix'))) {
          el.style.backgroundColor = '#ffffff'
        }
        const borderColor = window.getComputedStyle(el).borderColor
        if (borderColor && (borderColor.includes('oklab') || borderColor.includes('oklch') || borderColor.includes('color-mix'))) {
          el.style.borderColor = '#e5e7eb'
        }
      })
      // Tweak day cards
      clone.querySelectorAll<HTMLElement>('.card').forEach((card) => {
        card.style.minWidth = '320px'
        card.style.maxWidth = '360px'
      })

      wrapper.appendChild(clone)
      document.body.appendChild(wrapper)

      // Measure and capture at scale 2
      const rect = wrapper.getBoundingClientRect()
      window.scrollTo(0, 0)
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(wrapper, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        scrollX: 0,
        scrollY: 0,
      })
      // Prefer native share; special iOS handling
      const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b as Blob), 'image/png'))
      await shareOrSave(blob)

      if (wrapper && wrapper.parentElement) document.body.removeChild(wrapper)
    } catch (e: unknown) {
      console.warn('html2canvas failed, trying dom-to-image-more', e)
      try {
        const mod = (await import('dom-to-image-more')) as unknown
        const toPng = (mod as { toPng: (node: Node, opts?: { bgcolor?: string; quality?: number; filter?: (node: Node) => boolean }) => Promise<string> }).toPng
        const url = await toPng((wrapper as Node) || document.body, {
          bgcolor: '#ffffff',
          quality: 1,
          filter: (node: Node) => {
            if (!(node instanceof Element)) return true
            const style = window.getComputedStyle(node)
            const hasBad = ['oklab','oklch','color-mix'].some(k =>
              style.color.includes(k) || style.backgroundColor.includes(k) || (style.backgroundImage && style.backgroundImage.includes(k))
            )
            return !hasBad
          }
        })
        // Share or open in new tab on iOS/PWA
        try {
          const resp = await fetch(url)
          const blob = await resp.blob()
          await shareOrSave(blob)
        } catch {
          const a = document.createElement('a')
          a.href = url
          a.download = `${fileName}.png`
          a.click()
          setToast('Скачано')
          setTimeout(()=> setToast(null), 2000)
        }
        if (wrapper && wrapper.parentElement) document.body.removeChild(wrapper)
      } catch (e2: unknown) {
        console.error(e2)
        const msg = (e2 && (e2 as { message?: string }).message) || String(e2) || 'Ошибка'
        setToast(`Не удалось создать фото: ${String(msg).slice(0,60)}`)
        setTimeout(()=> setToast(null), 2000)
        try { if (wrapper && wrapper.parentElement) document.body.removeChild(wrapper) } catch {}
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative inline-block">
      <button onClick={handleClick} className="btn btn-outline btn-sm" disabled={busy} title="Скачать PNG недели">
        {busy ? 'Готовлю…' : 'Фото недели'}
      </button>
      {toast && (
        <div className="absolute z-10 -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 text-white text-xs px-2 py-1">
          {toast}
        </div>
      )}
      {overlayUrl && typeof window !== 'undefined' && createPortal(
        <div style={{ position:'fixed', top:0, right:0, bottom:0, left:0, background:'rgba(0,0,0,0.6)', zIndex: 9999 }}>
          <div style={{ position:'absolute', left:0, right:0, top:0, padding:'8px', display:'flex', alignItems:'center', justifyContent:'space-between', WebkitBackdropFilter:'saturate(180%) blur(8px)', backdropFilter:'saturate(180%) blur(8px)' }}>
            <div style={{ color:'#fff', fontSize:12 }}>Долгое нажатие по изображению → «Сохранить изображение»</div>
            <div style={{ display:'flex', gap:8 }}>
              <button
                className="btn btn-outline btn-xs"
                onClick={()=> { const u=overlayUrl; setOverlayUrl(null); if(u) URL.revokeObjectURL(u) }}
              >Закрыть</button>
              <button
                className="btn btn-secondary btn-xs"
                onClick={()=> { if (overlayUrl) window.open(overlayUrl, '_blank', 'noopener,noreferrer') }}
              >Открыть во вкладке</button>
            </div>
          </div>
          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'12px' }} onClick={()=> { const u=overlayUrl; setOverlayUrl(null); if(u) URL.revokeObjectURL(u) }}>
            <div style={{ position:'relative', width:'100%', height:'100%', maxWidth:'100%', maxHeight:'100%' }}>
              <Image src={overlayUrl} alt="week" fill unoptimized style={{ objectFit:'contain', borderRadius:8, boxShadow:'0 10px 30px rgba(0,0,0,0.3)' }} sizes="100vw" />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
