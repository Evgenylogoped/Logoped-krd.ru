export default function VipBadge({ level }: { level: 'VIP' | 'VIP+' }) {
  const bg = level === 'VIP+' ? 'linear-gradient(90deg, #ffd700, #ff8c00)' : 'linear-gradient(90deg, #a0e9ff, #69d2ff)'
  const text = level === 'VIP+' ? '#4a2500' : '#00324d'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm"
      style={{ background: bg, color: text, border: '1px solid rgba(0,0,0,0.06)' }}
    >
      {level}
    </span>
  )
}
