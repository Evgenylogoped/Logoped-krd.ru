"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="mx-auto max-w-screen-xl px-4 py-10 sm:py-14">
      <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 items-center">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
            My Logoped — современная платформа речевой терапии
          </h1>
          <p className="mt-3 text-muted text-base sm:text-lg">
            Для логопедов, родителей и центров: расписание, записи, абонементы, чаты и выплаты — всё в одном удобном приложении.
          </p>
          <ul className="mt-4 space-y-2 text-sm sm:text-base">
            <li className="flex items-start gap-2"><span className="emoji-bubble">📅</span><span>Компактное расписание с оценками и быстрыми действиями</span></li>
            <li className="flex items-start gap-2"><span className="emoji-bubble">💳</span><span>Оплаты, абонементы и прозрачные расчёты</span></li>
            <li className="flex items-start gap-2"><span className="emoji-bubble">👨‍👩‍👧</span><span>Личный кабинет для родителя без лишних шагов</span></li>
            <li className="flex items-start gap-2"><span className="emoji-bubble">🏢</span><span>Организационная аналитика и выплаты логопедам</span></li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href="/register" className="btn btn-primary btn-md btn-shine">Создать аккаунт</Link>
            <Link href="#subscriptions" className="btn btn-outline btn-md btn-shine">Подписки</Link>
            <a href="https://t.me/My_logoped?utm_source=landing&utm_medium=cta&utm_campaign=hero" target="_blank" rel="noopener" className="btn btn-ghost btn-md" aria-label="Открыть Telegram My Logoped" title="Открыть Telegram My Logoped">Telegram</a>
            <a href="https://wa.me/79889543377?utm_source=landing&utm_medium=cta&utm_campaign=hero" target="_blank" rel="noopener" className="btn btn-ghost btn-md" aria-label="Написать в WhatsApp" title="Написать в WhatsApp">WhatsApp</a>
          </div>
          <div className="mt-3 text-xs sm:text-sm text-muted">Работает на смартфоне и компьютере</div>
        </div>
        <ScreenshotsSlider />
      </div>
    </section>
  );
}

function ScreenshotsSlider() {
  const shots = useMemo(() => [
    { src: "/screens/schedule.svg", alt: "Расписание — неделя" },
    { src: "/screens/payment.svg", alt: "Запись и оплата" },
    { src: "/screens/passes.svg", alt: "Абонементы (пакеты занятий)" },
    { src: "/screens/payouts.svg", alt: "Выплаты логопеду" },
    { src: "/screens/chat.svg", alt: "Чаты: логопед ↔ родители" },
  ], []);

  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % shots.length), 3500);
    return () => clearInterval(id);
  }, [shots.length]);

  return (
    <div className="relative">
      <div className="aspect-[9/16] sm:aspect-[4/3] rounded-2xl glass border p-3 hover-card overflow-hidden">
        <div className="shine" />
        <div className="relative h-full w-full rounded-xl bg-white shadow flex items-center justify-center">
          {shots.map((s, idx) => (
            <div
              key={s.src}
              className={`absolute inset-0 transition-opacity duration-700 ${idx === i ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={idx !== i}
            >
              <Image src={s.src} alt={s.alt} fill priority className="object-contain"/>
            </div>
          ))}
        </div>
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {shots.map((_, idx) => (
            <span key={idx} className={`h-1.5 w-1.5 rounded-full ${idx===i? 'bg-indigo-600' : 'bg-gray-300'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
