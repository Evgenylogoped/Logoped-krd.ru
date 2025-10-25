// Generate PNG icons from SVG using sharp
// Usage: node scripts/gen-icons.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'public', 'icons', 'favicon.svg');
const OUTDIR = path.join(ROOT, 'public', 'icons');

const targets = [
  { file: 'icon-192.png', w: 192, h: 192 },
  { file: 'icon-512.png', w: 512, h: 512 },
  { file: 'apple-touch-icon-180.png', w: 180, h: 180 },
  { file: 'favicon-32.png', w: 32, h: 32 },
  { file: 'favicon-16.png', w: 16, h: 16 },
];

async function ensureOutDir() {
  await fs.mkdir(OUTDIR, { recursive: true });
}

async function main() {
  await ensureOutDir();
  const svg = await fs.readFile(SRC);
  await Promise.all(
    targets.map(async (t) => {
      const out = path.join(OUTDIR, t.file);
      await sharp(svg).resize(t.w, t.h, { fit: 'contain' }).png().toFile(out);
      // eslint-disable-next-line no-console
      console.log('generated', path.relative(ROOT, out));
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
