import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const logopedId = url.searchParams.get("logopedId") || undefined;
  const dateFromStr = url.searchParams.get("from");
  const dateToStr = url.searchParams.get("to");
  const where: any = {};
  if (logopedId) where.logopedId = logopedId;
  if (dateFromStr || dateToStr) {
    where.startsAt = {} as any;
    if (dateFromStr) (where.startsAt as any).gte = new Date(dateFromStr!);
    if (dateToStr) (where.startsAt as any).lte = new Date(dateToStr!);
  }
  const lessons = await prisma.lesson.findMany({
    where,
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, endsAt: true, logopedId: true, logoped: { select: { id: true, name: true, email: true } }, _count: { select: { bookings: true } } },
    take: 200,
  });
  return NextResponse.json({ lessons });
}
