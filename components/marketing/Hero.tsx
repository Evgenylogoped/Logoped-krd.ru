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
          <div className="mt-1 text-sm text-muted">сайт Logoped-KRD.ru</div>
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
            <a href="https://t.me/My_logoped?utm_source=landing&utm_medium=cta&utm_campaign=hero" target="_blank" rel="noopener" className="btn btn-ghost btn-md inline-flex items-center gap-2" aria-label="Открыть Telegram My Logoped" title="Открыть Telegram My Logoped">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.18 15.08l-.38 5.33c.54 0 .77-.23 1.04-.5l2.5-2.41 5.18 3.8c.95.52 1.62.25 1.88-.87l3.41-15.96h.01c.3-1.4-.5-1.95-1.42-1.6L1.56 9.4c-1.37.53-1.35 1.3-.23 1.65l5.34 1.67L19.42 5.8c.64-.42 1.22-.19.74.23L9.18 15.08z" fill="#229ED9"/></svg>
              Telegram
            </a>
            <a href="https://wa.me/79889543377?text=%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B9%D1%82%D0%B5!%20%D0%9F%D0%B8%D1%88%D1%83%20%D1%81%20%D1%81%D0%B0%D0%B9%D1%82%D0%B0%20Logoped-KRD.ru.&utm_source=landing&utm_medium=cta&utm_campaign=hero" target="_blank" rel="noopener" className="btn btn-ghost btn-md inline-flex items-center gap-2" aria-label="Написать в WhatsApp" title="Написать в WhatsApp">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12.01 2C6.49 2 2 6.37 2 11.76c0 2.1.68 4.05 1.83 5.65L2 22l4.78-1.52c1.55.85 3.34 1.33 5.22 1.33 5.52 0 10.01-4.37 10.01-9.76C22.01 6.37 17.53 2 12.01 2zM17.3 16.1c-.22.63-1.26 1.16-1.77 1.19-.45.03-1.02.04-1.64-.1-.38-.08-.88-.28-1.52-.55-2.67-1.16-4.4-3.85-4.53-4.03-.13-.18-1.08-1.45-1.08-2.77 0-1.32.69-1.97.93-2.24.24-.27.52-.34.7-.34.18 0 .35 0 .5.01.16.01.38-.06.6.46.22.54.75 1.87.82 2.01.07.14.11.3.02.48-.09.18-.14.29-.28.45-.14.16-.29.36-.41.49-.14.14-.29.29-.12.56.18.27.8 1.32 1.72 2.14 1.19 1.03 2.19 1.35 2.48 1.5.29.15.46.13.63-.08.18-.21.73-.86.93-1.16.2-.3.4-.25.66-.15.27.1 1.71.8 2 .94.3.14.5.21.57.33.07.12.07.7-.15 1.33z" fill="#25D366"/></svg>
              WhatsApp
            </a>
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
    { src: "/screens/hero-1.png", alt: "Чаты: логопед ↔ родители" },
    { src: "/screens/hero-2.png", alt: "Транзакции и выплаты" },
    { src: "/screens/hero-3.png", alt: "Календарь — неделя" },
    { src: "/screens/hero-4.png", alt: "Расписание — день и быстрые действия" },
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
