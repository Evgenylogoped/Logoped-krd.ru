import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import fsSync from 'fs'

function resolvePublicDir() {
  let dir = process.cwd()
  const root = path.parse(dir).root
  while (dir && dir !== root) {
    if (fsSync.existsSync(path.join(dir, 'public'))) return path.join(dir, 'public')
    if (fsSync.existsSync(path.join(dir, 'package.json'))) return path.join(dir, 'public')
    dir = path.dirname(dir)
  }
  return path.join(process.cwd(), 'public')
}

export async function GET(_req: Request, { params }: any) {
  try {
    const pub = resolvePublicDir()
    const rel = params.path.join('/')
    // Security: normalize within uploads/children
    const safe = path.normalize(rel).replace(/^\.\/+/, '')
    const full = path.join(pub, 'uploads', 'children', safe)
    const stat = await fs.stat(full)
    if (!stat.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const buf = await fs.readFile(full)
    // Basic content type
    const ext = path.extname(full).toLowerCase()
    const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : 'application/octet-stream'
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600',
      }
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
