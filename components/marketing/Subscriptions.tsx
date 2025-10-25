"use client";
import React from "react";

export default function Subscriptions() {
  const subs = [
    {
      name: "Бесплатно",
      badge: "для старта",
      price: "0 ₽",
      note: "Навсегда",
      bullets: [
        "Личный кабинет родителя",
        "Расписание и записи",
        "Оценки занятий",
      ],
      cta: { label: "Начать", href: "/register" },
    },
    {
      name: "Премиум",
      badge: "для логопеда",
      price: "990 ₽",
      note: "/мес",
      highlight: true,
      bullets: [
        "Абонементы и оплаты",
        "Чаты и напоминания",
        "Экспорт и отчёты",
        "Приём платежей",
      ],
      cta: { label: "Попробовать 14 дней", href: "/register/logoped" },
    },
    {
      name: "Организация",
      badge: "для сети",
      price: "индивидуально",
      note: "",
      bullets: [
        "Филиалы и роли",
        "Выплаты логопедам",
        "Отчётность и лимиты",
      ],
      cta: { label: "Связаться", href: "mailto:info@logoped-krd.ru" },
    },
  ];

  return (
    <section className="mx-auto max-w-screen-xl px-4 py-12 sm:py-16">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Подписки</h2>
        <p className="mt-2 text-muted">Прозрачно, без мелкого шрифта. Отмена в один клик.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {subs.map((s) => (
          <div key={s.name} className={`rounded-2xl border bg-white p-6 relative ${s.highlight ? 'ring-2 ring-indigo-500 shadow-lg' : ''}`}>
            <div className="text-xs uppercase tracking-wide text-indigo-600">{s.badge}</div>
            <div className="mt-1 text-lg font-semibold">{s.name}</div>
            <div className="mt-3 text-4xl font-extrabold">{s.price} <span className="text-base font-medium text-muted">{s.note}</span></div>
            <ul className="mt-4 space-y-2 text-sm">
              {s.bullets.map((b)=> (
                <li key={b} className="flex items-start gap-2"><span className="emoji-bubble">✨</span><span>{b}</span></li>
              ))}
            </ul>
            <div className="mt-6">
              <a href={s.cta.href} className={`btn ${s.highlight? 'btn-primary btn-shine' : 'btn-outline'}`}>{s.cta.label}</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}







