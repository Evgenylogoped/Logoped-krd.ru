"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

export async function createLesson(formData: FormData) {
  const session = await getServerSession(authOptions);
  assert(session?.user, "Unauthorized");
  const me = await prisma.user.findUnique({ where: { id: (session!.user as any).id as string }, include: { branch: true } });
  assert(me?.branchId, "Вы не состоите в организации");
  const title = String(formData.get("title") || "").trim() || "Занятие";
  const startsAtStr = String(formData.get("startsAt") || "").trim();
  const endsAtStr = String(formData.get("endsAt") || "").trim();
  const groupIdRaw = String(formData.get("groupId") || "").trim();
  assert(startsAtStr && endsAtStr, "Укажите дату и время");
  const startsAt = new Date(startsAtStr);
  const endsAt = new Date(endsAtStr);
  assert(!isNaN(startsAt.getTime()) && !isNaN(endsAt.getTime()) && endsAt > startsAt, "Некорректное время");

  let groupId = groupIdRaw || "";
  if (!groupId) {
    // ensure default group "Индивидуальные занятия" in branch
    let group = await prisma.group.findFirst({ where: { branchId: me!.branchId!, name: "Индивидуальные занятия" } });
    if (!group) {
      group = await prisma.group.create({ data: { branchId: me!.branchId!, name: "Индивидуальные занятия" } });
    }
    groupId = group.id;
  } else {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    assert(group && group.branchId === me!.branchId, "Группа должна быть в вашем филиале");
  }

  await prisma.lesson.create({
    data: {
      title,
      startsAt,
      endsAt,
      groupId,
      logopedId: me!.id,
    },
  });

  revalidatePath("/logoped/today");
  revalidatePath("/logoped/schedule");
}
