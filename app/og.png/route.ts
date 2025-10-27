import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export async function GET() {
  const { width, height } = size
  const logo = new URL('/logo.png', 'https://logoped-krd.ru').toString()
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            padding: '48px 64px 16px',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src={logo} width={64} height={64} style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: '#0f172a' }}>My Logoped</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#475569' }}>сайт Logoped-KRD.ru</div>
          </div>
        </div>

        <div style={{ padding: '0 64px', color: '#334155', fontSize: 28, fontWeight: 600 }}>
          My Logoped — расписание, записи, абонементы, чаты и выплаты — всё в одном удобном приложении.
        </div>

        <div
          style={{
            marginTop: 32,
            marginLeft: 64,
            marginRight: 64,
            padding: 24,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            gap: 20,
          }}
        >
          {['📅 Компактное расписание и быстрые действия','💳 Оплаты и абонементы','👨‍👩‍👧 ЛК для родителей','🏢 Аналитика и выплаты логопедам'].map((t) => (
            <div key={t} style={{ fontSize: 22, color: '#334155' }}>{t}</div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', padding: '0 64px 40px', display: 'flex', gap: 12, color: '#475569' }}>
          <div style={{ padding: '10px 16px', borderRadius: 999, background: '#4f46e5', color: '#fff', fontSize: 22, fontWeight: 700 }}>logoped-krd.ru</div>
          <div style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid #e5e7eb', fontSize: 20 }}>My Logoped</div>
        </div>
      </div>
    ),
    { width, height }
  )
}
