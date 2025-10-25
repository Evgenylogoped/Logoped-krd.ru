import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #a5b4fc 0%, #fbcfe8 100%)',
          fontFamily: 'Inter, ui-sans-serif, system-ui',
        }}
      >
        <div style={{ margin: 64, background: 'rgba(255,255,255,0.92)', borderRadius: 24, padding: 40, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 32 }}>Л</div>
            <div style={{ fontSize: 44, fontWeight: 800, color: '#0f172a' }}>Logoped</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 24, fontWeight: 600, color: '#334155' }}>Платформа для логопедов, родителей и организаций</div>
          <div style={{ marginTop: 24, fontSize: 22, color: '#475569', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 8 }}>• Компактное расписание с оценками</div>
            <div style={{ marginBottom: 8 }}>• Записи, оплаты и абонементы</div>
            <div>• Орг. аналитика и выплаты</div>
          </div>
          <div style={{ marginTop: 28, background: '#4f46e5', color: '#fff', borderRadius: 12, width: 300, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22 }}>Начать бесплатно</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
