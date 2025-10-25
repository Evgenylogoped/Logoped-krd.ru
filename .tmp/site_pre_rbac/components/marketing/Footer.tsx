"use client";
import React from "react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-screen-xl px-4 py-8 text-sm text-muted">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between items-center">
        <div>© {new Date().getFullYear()} Logoped KRD</div>
        <div className="flex items-center gap-3">
          <Link href="/privacy" className="hover:underline">Политика</Link>
          <Link href="/terms" className="hover:underline">Условия</Link>
          <a href="mailto:79889543377@yandex.ru" className="hover:underline">Связаться</a>
          <a href="https://instagram.com/my_logoped" target="_blank" rel="noopener" className="hover:underline">Instagram: @my_logoped</a>
        </div>
      </div>
    </footer>
  );
}
