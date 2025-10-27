export const dynamic = 'force-dynamic'

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Вы офлайн · My Logoped</title>
        <link rel="icon" href="/icons/favicon-32.png" />
      </head>
      <body style={{ background: '#f8fafc', color: '#0f172a' }}>{children}</body>
    </html>
  )
}
