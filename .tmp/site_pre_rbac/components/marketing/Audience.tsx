"use client";
import React from "react";

export default function Audience() {
  return (
    <section className="mx-auto max-w-screen-xl px-4 py-10 sm:py-14">
      <h2 className="text-2xl sm:text-3xl font-bold">Для кого</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card title="Родители" text="Удобная запись на занятия, оплата, связь с логопедом — всё с телефона." emoji="👨‍👩‍👧" />
        <Card title="Логопеды" text="Планирование, группы, консультации, чаты — быстро и понятно." emoji="🧑‍🏫" />
        <Card title="Организации" text="Филиалы, сотрудники, лимиты, статистика и отчёты для бухгалтерии." emoji="🏢" />
      </div>
    </section>
  );
}

function Card({ title, text, emoji }: { title: string; text: string; emoji: string }) {
  return (
    <div className="rounded-2xl border p-4 bg-white">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 text-lg font-semibold">{title}</div>
      <div className="text-muted">{text}</div>
    </div>
  );
}
