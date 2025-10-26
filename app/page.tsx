 import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Landing from "@/components/marketing/Landing";

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getServerSession(authOptions);
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
