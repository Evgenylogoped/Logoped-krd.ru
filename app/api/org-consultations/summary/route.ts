import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const meId = (session.user as any).id as string;
  const [inboxPending, inboxNew, outboxPending] = await Promise.all([
    prisma.orgConsultationRequest.count({ where: { targetId: meId, status: "PENDING" } }),
    prisma.orgConsultationRequest.count({ where: { targetId: meId, status: "PENDING", targetReadAt: null } }),
    prisma.orgConsultationRequest.count({ where: { requesterId: meId, status: "PENDING" } }),
  ]);
  return NextResponse.json({ inboxPending, inboxNew, outboxPending });
}
