"use client";
import React from "react";

export default function Pricing() {
  const plans = [
    {
      name: "Старт",
      price: "0 ₽",
      period: "/мес",
      features: [
        "Личный кабинет",
        "Расписание и записи",
        "Оценки занятий",
      ],
      cta: { label: "Начать бесплатно", href: "/login", primary: true },
    },
    {
      name: "Профи",
      price: "990 ₽",
      period: "/мес",
      features: [
        "Абонементы и оплаты",
        "Чаты и уведомления",
        "Экспорт отчётов",
      ],
      cta: { label: "Подключить", href: "/login", primary: false },
      highlight: true,
    },
    {
      name: "Организация",
      price: "по запросу",
      period: "",
      features: [
        "Несколько филиалов",
        "Лимиты и роли",
        "Выплаты логопедам",
      ],
      cta: { label: "Связаться", href: "mailto:info@logoped-krd.ru", primary: false },
    },
  ];
  return (
    <section className="mx-auto max-w-screen-xl px-4 py-10 sm:py-14">
      <h2 className="text-2xl sm:text-3xl font-bold">Тарифы</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <div key={p.name} className={`rounded-2xl border p-5 bg-white ${p.highlight? 'ring-2 ring-indigo-500': ''}`}>
            <div className="text-lg font-semibold">{p.name}</div>
            <div className="mt-2 text-3xl font-extrabold">{p.price} <span className="text-base font-medium text-muted">{p.period}</span></div>
            <ul className="mt-4 space-y-2 text-sm">
              {p.features.map((f)=> (<li key={f} className="flex items-start gap-2"><span className="emoji-bubble">✅</span><span>{f}</span></li>))}
            </ul>
            <div className="mt-5">
              <a href={p.cta.href} className={`btn ${p.cta.primary? 'btn-primary': 'btn-outline'}`}>{p.cta.label}</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
