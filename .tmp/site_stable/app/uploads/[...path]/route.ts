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
    const safe = path.normalize(rel).replace(/^\.\/+/, '')
    const full = path.join(pub, 'uploads', safe)
    const stat = await fs.stat(full)
    if (!stat.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const buf = await fs.readFile(full)
    const ext = path.extname(full).toLowerCase()
    const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif'
      : ext === '.svg' ? 'image/svg+xml'
      : ext === '.bmp' ? 'image/bmp'
      : ext === '.heic' || ext === '.heif' ? 'image/heic'
      : ext === '.mp4' ? 'video/mp4'
      : ext === '.webm' ? 'video/webm'
      : ext === '.mov' ? 'video/quicktime'
      : ext === '.mp3' ? 'audio/mpeg'
      : ext === '.m4a' ? 'audio/mp4'
      : ext === '.ogg' ? 'audio/ogg'
      : ext === '.wav' ? 'audio/wav'
      : ext === '.pdf' ? 'application/pdf'
      : 'application/octet-stream'
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=60',
      }
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
