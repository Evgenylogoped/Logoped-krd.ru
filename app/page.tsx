import { redirect } from "next/navigation";
import Landing from "@/components/marketing/Landing";

export const dynamic = 'force-dynamic'

export default async function Home() {
  const na = 'next-auth' as const
  const mod = await import(na as any).catch(() => null as any)
  const auth = await import("@/lib/auth").catch(() => null as any)
  const getServerSession: any = mod?.getServerSession
  const authOptions = auth?.authOptions
  const session = (typeof getServerSession === 'function' && authOptions) ? await getServerSession(authOptions) : null
  const role = (session?.user as any)?.role as string | undefined;
  if (role === 'LOGOPED') {
    return redirect('/logoped');
  }
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT') {
    return redirect('/admin');
  }
  if (role === 'PARENT') {
    return redirect('/parent');
  }
  return <Landing />;
}
