import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
    const ext = path.extname(file.name) || ''
    const base = path.basename(file.name, ext).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 32) || 'file'
    const name = `${base}-${Date.now()}${ext}`
    const destPath = path.join(uploadsDir, name)
    fs.writeFileSync(destPath, buffer)
    const url = `/uploads/${name}`
    return NextResponse.json({ url })
  } catch (e) {
    return NextResponse.json({ error: 'upload failed' }, { status: 500 })
  }
}
