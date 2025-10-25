"use client";
import React from "react";

export default function Features() {
  const items = [
    { title: "Расписание", text: "Плотное представление, чипы оценок, быстрые действия. Экономит до 40% времени." },
    { title: "Консультации", text: "Прозрачный поток: руководитель филиала и логопед согласуют запрос в два шага." },
    { title: "Запись и оплата", text: "Онлайн‑запись за 30 секунд и оплата картой. Меньше звонков — больше занятий." },
    { title: "Статистика", text: "Филиалы, выручка, посещаемость. Экспорт XLS/CSV для ежемесячной отчётности." },
  ];
  return (
    <section className="mx-auto max-w-screen-xl px-4 py-10 sm:py-14">
      <h2 className="text-2xl sm:text-3xl font-bold">Возможности</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((it)=> (
          <div key={it.title} className="rounded-2xl border p-4 glass hover-card">
            <div className="text-lg font-semibold">{it.title}</div>
            <div className="text-muted mt-1">{it.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
