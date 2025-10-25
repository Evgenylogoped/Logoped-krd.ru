"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function assert(cond: any, msg: string): asserts cond { if (!cond) throw new Error(msg); }

export async function createBooking(formData: FormData) {
  const session = await getServerSession(authOptions);
  assert(session?.user, "Unauthorized");
  const me = await prisma.user.findUnique({ where: { id: (session!.user as any).id as string }, include: { parent: true } });
  assert(me, "User not found");
  const lessonId = String(formData.get("lessonId") || "").trim();
  assert(lessonId, "Нет lessonId");
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  assert(lesson, "Занятие не найдено");

  // Выберем первого активного ребёнка этого родителя
  const parentId = (me!.parent as any)?.id as string | undefined;
  assert(parentId, "Нет карточки родителя");
  const child = await prisma.child.findFirst({ where: { parentId, isArchived: false } });
  assert(child, "Нет активных детей для брони");

  const holder = me.parent?.fullName || me!.name || me!.email || "Родитель";
  await prisma.booking.create({ data: { lessonId, holder, createdBy: me!.id, status: "ACTIVE", childId: child!.id } });

  revalidatePath("/parent/schedule");
  revalidatePath("/parent/schedule/slots");
}
