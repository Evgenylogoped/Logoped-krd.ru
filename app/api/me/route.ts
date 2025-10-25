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
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: me.id,
    role: me.role,
    email: me.email,
    name: me.name,
    branchId: me.branchId,
    companyId: me.branch?.companyId || null,
    isOrgLeader: me.branch?.company?.ownerId === me.id,
    isBranchManager: me.branch?.managerId === me.id,
  });
}
