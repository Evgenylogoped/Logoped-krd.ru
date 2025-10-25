import { prisma } from '@/lib/prisma'

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let ok = false
  try {
    const rec = await (prisma as any).verificationToken.findUnique({ where: { token } })
    if (rec && new Date(rec.expires) > new Date()) {
      await (prisma as any).user.update({ where: { email: rec.identifier }, data: { emailVerifiedAt: new Date() } })
      await (prisma as any).verificationToken.delete({ where: { token } })
      ok = true
    }
  } catch {}
  return (
    <div className="container py-10 max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Подтверждение email</h1>
      {ok ? (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">Email подтверждён. Теперь вы можете <a className="underline" href="/login">войти</a>.</div>
      ) : (
        <div className="rounded border p-3 bg-amber-50 text-amber-800">Ссылка недействительна или истекла.</div>
      )}
    </div>
  )
}







