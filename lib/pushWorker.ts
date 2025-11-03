import { processPushQueue } from '@/lib/pushDispatch'

// Starts a lightweight interval worker inside the Node.js runtime.
// It runs only once per process thanks to the global flag.
const g: any = globalThis as any
if (!g.__push_worker_started) {
  g.__push_worker_started = true
  try {
    // small jitter to avoid thundering herd on restarts
    const first = 5000 + Math.floor(Math.random() * 5000)
    setTimeout(() => {
      // run every minute
      setInterval(() => { processPushQueue(50).catch(()=>{}) }, 60_000)
      // prime run
      processPushQueue(25).catch(()=>{})
    }, first)
  } catch {}
}

export {}
