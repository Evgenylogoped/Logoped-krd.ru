"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendMail } from "@/lib/mail";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function getMe() {
  const session = await getServerSession(authOptions);
  assert(session?.user, "Unauthorized");
  const me = await prisma.user.findUnique({
    where: { id: String((session!.user as { id?: string } | undefined)?.id || "") },
    include: { branch: { include: { company: true } } },
  });
  assert(me, "User not found");
  return me!;
}

function isCompanyOwner(me: { id?: string | null; branch?: { company?: { ownerId?: string | null } | null } | null }) {
  return Boolean(me?.branch?.company?.ownerId === me?.id);
}

async function ensureTargetInCompany(targetId: string, companyId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: { branch: true },
  });
  assert(user, "Пользователь не найден");
  assert(user!.branchId, "Пользователь не состоит в организации");
  const branch = await prisma.branch.findUnique({ where: { id: user!.branchId! } });
  assert(branch && branch.companyId === companyId, "Пользователь не из вашей компании");
  return user!;
}

export async function createOrgConsultationRequest(formData: FormData) {
  const me = await getMe();
  const targetId = String(formData.get("targetId") || "").trim();
  const topic = String(formData.get("topic") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;
  assert(targetId, "Нет targetId");
  assert(me.branchId, "Вы не состоите в организации");
  const companyId = me.branch.companyId as string;

  const target = await ensureTargetInCompany(targetId, companyId);

  // Права: владелец - любой сотрудник компании; руководитель филиала - только логопеды своего филиала
  if (!isCompanyOwner(me)) {
    // руководитель филиала?
    const myManaged = await prisma.branch.findFirst({ where: { managerId: me.id, companyId } });
    assert(myManaged, "Нет прав создавать запрос");
    const myManagedId = myManaged?.id;
    assert(myManagedId, "Нет прав создавать запрос");
    // target должен быть логопедом этого филиала
    assert(target.role === "LOGOPED", "Можно запрашивать у логопеда своего филиала");
    assert(target.branchId === myManagedId, "Логопед должен быть из вашего филиала");
  }

  await prisma.orgConsultationRequest.create({
    data: {
      requesterId: me.id,
      targetId,
      companyId,
      branchId: isCompanyOwner(me) ? null : me.branchId,
      topic,
      note,
      status: "PENDING",
    },
  });

  // уведомление целевому
  if (target.email) {
    try {
      await sendMail({
        to: target.email,
        subject: "Новый запрос консультации",
        text: `Вам поступил запрос консультации от ${me.name || me.email}. Тема: ${topic || "(без темы)"}.`,
      });
    } catch {}
  }
  revalidatePath("/settings/organization/consultations");
}

export async function approveOrgConsultationRequest(formData: FormData) {
  const me = await getMe();
  const id = String(formData.get("id") || "");
  assert(id, "Нет id");
  const req = await prisma.orgConsultationRequest.findUnique({ where: { id } });
  assert(req, "Запрос не найден");
  assert(req!.targetId === me.id, "Можно подтверждать только свои входящие запросы");
  assert(req!.status === "PENDING", "Запрос уже обработан");
  await prisma.orgConsultationRequest.update({ where: { id }, data: { status: "APPROVED", decidedAt: new Date() } });
  // уведомление заявителю
  const requester = await prisma.user.findUnique({ where: { id: req!.requesterId } });
  if (requester?.email) {
    try {
      await sendMail({ to: requester.email, subject: "Запрос консультации одобрен", text: "Ваш запрос консультации одобрен." });
    } catch {}
  }
  revalidatePath("/settings/organization/consultations");
}

export async function rejectOrgConsultationRequest(formData: FormData) {
  const me = await getMe();
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim() || null;
  assert(id, "Нет id");
  const req = await prisma.orgConsultationRequest.findUnique({ where: { id } });
  assert(req, "Запрос не найден");
  assert(req!.targetId === me.id, "Можно отклонять только свои входящие запросы");
  assert(req!.status === "PENDING", "Запрос уже обработан");
  await prisma.orgConsultationRequest.update({ where: { id }, data: { status: "REJECTED", reason, decidedAt: new Date() } });
  // уведомление заявителю
  const requester = await prisma.user.findUnique({ where: { id: req!.requesterId } });
  if (requester?.email) {
    try {
      await sendMail({ to: requester.email, subject: "Запрос консультации отклонен", text: reason ? `Причина: ${reason}` : "Ваш запрос консультации отклонен." });
    } catch {}
  }
  revalidatePath("/settings/organization/consultations");
}

export async function markOrgConsultationRead(formData: FormData) {
  const me = await getMe();
  const id = String(formData.get("id") || "");
  const side = String(formData.get("side") || ""); // requester|target
  assert(id && (side === "requester" || side === "target"), "Некорректные данные");
  const req = await prisma.orgConsultationRequest.findUnique({ where: { id } });
  assert(req, "Запрос не найден");
  if (side === "requester") assert(req!.requesterId === me.id, "Можно пометить только свои исходящие");
  if (side === "target") assert(req!.targetId === me.id, "Можно пометить только свои входящие");
  await prisma.orgConsultationRequest.update({
    where: { id },
    data: side === "requester" ? { requesterReadAt: new Date() } : { targetReadAt: new Date() },
  });
}

export async function listOrgConsultationsInbox() {
  const me = await getMe();
  return prisma.orgConsultationRequest.findMany({
    where: { targetId: me.id },
    orderBy: { createdAt: "desc" },
    include: { requester: true },
  });
}

export async function listOrgConsultationsOutbox() {
  const me = await getMe();
  return prisma.orgConsultationRequest.findMany({
    where: { requesterId: me.id },
    orderBy: { createdAt: "desc" },
    include: { target: true },
  });
}
