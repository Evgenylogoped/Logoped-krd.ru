import webpush from 'web-push'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails('mailto:support@logoped-krd.ru', VAPID_PUBLIC, VAPID_PRIVATE)
  } catch {}
}

export { webpush, VAPID_PUBLIC }
