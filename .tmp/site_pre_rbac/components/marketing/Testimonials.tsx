"use client";
import React from "react";

export default function Testimonials() {
  const items = [
    { name: "Анна", role: "Родитель", text: "Стало намного проще записываться на занятия и следить за расписанием." },
    { name: "Иван", role: "Логопед", text: "Люблю мобильный интерфейс: быстро создаю занятия и вижу актуальные записи." },
    { name: "Мария", role: "Руководитель филиала", text: "Наконец все сотрудники, консультации и статистика — в одном месте." },
  ];
  return (
    <section className="mx-auto max-w-screen-xl px-4 py-10 sm:py-14">
      <h2 className="text-2xl sm:text-3xl font-bold">Отзывы</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-2xl border p-4 bg-white">
            <div className="text-lg font-semibold">{it.name}</div>
            <div className="text-xs text-muted">{it.role}</div>
            <div className="mt-2 text-muted">“{it.text}”</div>
          </div>
        ))}
      </div>
    </section>
  );
}
