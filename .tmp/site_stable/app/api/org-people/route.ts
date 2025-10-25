import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { id: (session.user as any).id as string },
    include: { branch: { include: { company: true } } },
  });
  if (!me?.branchId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = me.branch!.companyId;
  const isOwner = me.branch!.company?.ownerId === me.id;
  const isManager = me.branch?.managerId === me.id;

  if (!isOwner && !isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let users: any[] = [];
  if (isOwner) {
    users = await prisma.user.findMany({
      where: { branch: { companyId } },
      select: { id: true, name: true, email: true, role: true, branchId: true },
      orderBy: [{ branchId: "asc" }, { name: "asc" }],
    });
  } else {
    users = await prisma.user.findMany({
      where: { role: "LOGOPED", branchId: me.branchId! },
      select: { id: true, name: true, email: true, role: true, branchId: true },
      orderBy: [{ name: "asc" }],
    });
  }

  return NextResponse.json({ users });
}
