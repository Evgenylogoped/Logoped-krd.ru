"use client";
import React from "react";

export default function FAQ() {
  const faqs = [
    { q: "Можно ли пользоваться бесплатно?", a: "Да, базовый тариф Старт — бесплатно. Включает личный кабинет, расписание и оценки занятий." },
    { q: "Как подключить оплаты?", a: "В тарифе Профи доступны абонементы и оплаты. Мы поможем с подключением и настройкой." },
    { q: "Подходит ли для сети филиалов?", a: "Да, тариф Организация поддерживает несколько филиалов, роли сотрудников и выплаты логопедам." },
    { q: "Есть ли мобильное приложение?", a: "Работаем как PWA: можно установить на главный экран iOS/Android. Доступна офлайн-оболочка и пуш-уведомления (где возможно)." },
  ];
  return (
    <section className="mx-auto max-w-screen-xl px-4 py-10 sm:py-14">
      <h2 className="text-2xl sm:text-3xl font-bold">FAQ</h2>
      <div className="mt-6 grid gap-3">
        {faqs.map((f)=> (
          <details key={f.q} className="rounded-2xl border p-4 bg-white">
            <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
            <div className="mt-2 text-muted">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
