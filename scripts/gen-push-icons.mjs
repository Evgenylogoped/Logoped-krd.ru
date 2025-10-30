import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

async function main(){
  const repoRoot = process.cwd()
  const src = path.join(repoRoot, 'public', 'icons', 'icon-512.png')
  const outDir = path.join(repoRoot, 'public', 'icons')
  const outIcon = path.join(outDir, 'push-512.png')
  const outBadge = path.join(outDir, 'badge-96.png')

  if (!fs.existsSync(src)) {
    console.error('[icons] source not found:', src)
    process.exit(0)
  }
  await fs.promises.mkdir(outDir, { recursive: true })

  // push icon 512x512 (pass-through to ensure exists)
  await sharp(src)
    .resize(512, 512, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outIcon)
  console.log('[icons] generated', outIcon)

  // badge 96x96, grayscale
  await sharp(src)
    .resize(96, 96, { fit: 'contain', background: { r:255, g:255, b:255, alpha:1 } })
    .grayscale()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outBadge)
  console.log('[icons] generated', outBadge)
}

main().catch(err=>{ console.error(err); process.exit(1) })
