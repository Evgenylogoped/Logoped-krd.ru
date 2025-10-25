import { FullConfig } from '@playwright/test'
import { spawn } from 'child_process'

async function run(cmd: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, { shell: true, stdio: 'inherit' })
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)))
  })
}

export default async function globalSetup(config: FullConfig) {
  // Ensure e2e users exist
  await run('node prisma/seed-e2e.cjs')
}
