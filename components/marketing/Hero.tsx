"use client";
import React from "react";
import Link from "next/link";

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
            <a href="https://t.me/My_logoped" target="_blank" rel="noopener" className="btn btn-ghost btn-md">Telegram</a>
            <a href="https://wa.me/79889543377" target="_blank" rel="noopener" className="btn btn-ghost btn-md">WhatsApp</a>
          </div>
          <div className="mt-3 text-xs sm:text-sm text-muted">Работает на смартфоне и компьютере</div>
        </div>
        <div className="relative">
          <div className="aspect-[9/16] sm:aspect-[4/3] rounded-2xl glass border p-3 hover-card">
            <div className="shine" />
            <div className="h-full w-full rounded-xl bg-white shadow flex items-center justify-center text-gray-400">
              Скриншоты скоро будут
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
