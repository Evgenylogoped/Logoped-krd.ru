"use client";
import React from "react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-screen-xl px-4 py-8 text-sm text-muted">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between items-center">
        <div>© {new Date().getFullYear()} My Logoped (logoped-krd.ru)</div>
        <div className="flex items-center gap-3">
          <Link href="/privacy" className="hover:underline">Политика конфиденциальности</Link>
          <Link href="/terms" className="hover:underline">Пользовательское соглашение</Link>
          <a href="https://instagram.com/My_logoped" target="_blank" rel="noopener" className="hover:underline">Instagram: @My_logoped</a>
          <a href="https://t.me/My_logoped" target="_blank" rel="noopener" className="hover:underline">Telegram</a>
          <a href="https://wa.me/79889543377" target="_blank" rel="noopener" className="hover:underline">WhatsApp</a>
        </div>
      </div>
      <div className="mt-3 text-center sm:text-right">
        <span className="block sm:inline">Разработчик: Новиков Е.В.</span>
        <span className="mx-2">·</span>
        <a href="tel:+79889543377" className="hover:underline">+7 988 954‑33‑77</a>
      </div>
    </footer>
  );
}
