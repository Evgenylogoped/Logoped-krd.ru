import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: (session.user as any).id as string }, include: { branch: { include: { company: true } } } });
  if (!me?.branchId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = me.branch!.companyId;
  const logopeds = await prisma.user.findMany({ where: { role: 'LOGOPED', branch: { companyId } }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } });
  return NextResponse.json({ logopeds });
}
