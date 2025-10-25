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
  if (!me?.branchId) return NextResponse.json({ users: [] });
  const isOrgLeader = me.branch?.company?.ownerId === me.id;
  const isBranchManager = me.branch?.managerId === me.id;

  let users: any[] = [];
  if (isOrgLeader) {
    users = await prisma.user.findMany({
      where: { branch: { companyId: me.branch!.companyId }, role: "LOGOPED" },
      select: { id: true, name: true, email: true, branchId: true },
      orderBy: [{ branchId: "asc" }, { name: "asc" }],
    });
  } else if (isBranchManager) {
    users = await prisma.user.findMany({
      where: { role: "LOGOPED", branchId: me.branchId! },
      select: { id: true, name: true, email: true, branchId: true },
      orderBy: [{ name: "asc" }],
    });
  } else {
    users = [];
  }

  return NextResponse.json({ users });
}
