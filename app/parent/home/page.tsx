"use client";
import React from "react";
import MobileFAB from "@/components/mobile/MobileFAB";
import { useRouter } from "next/navigation";

export default function ParentHomePage() {
  const router = useRouter();
  return (
    <div className="grid gap-3 relative">
      <div className="text-lg font-semibold">Мои дети</div>
      <div className="border rounded-lg p-3" style={{ background: 'var(--card-bg)' }}>Пока здесь пусто. Скоро добавим карточки детей и быстрые действия.</div>
      <div className="text-lg font-semibold mt-2">Ближайшие занятия</div>
      <div className="border rounded-lg p-3" style={{ background: 'var(--card-bg)' }}>Нет ближайших занятий.</div>

      <MobileFAB icon="➕" label="Записаться" onClick={()=>router.push('/parent/schedule/slots')} />
    </div>
  );
}
