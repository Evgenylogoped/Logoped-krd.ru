// Minimal cron trigger for reminders inside container
(async () => {
  try {
    const key = process.env.CRON_PUSH_KEY || ''
    const res = await fetch('http://127.0.0.1:3000/api/push/reminders', {
      method: 'POST',
      headers: key ? { 'X-CRON-KEY': key } : {},
    })
    // Avoid throwing on non-200; just exit
    await res.text().catch(()=>{})
  } catch (_) {
    // ignore
  }
  process.exit(0)
})()
