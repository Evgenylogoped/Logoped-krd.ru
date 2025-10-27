"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function MarketingHeader() {
  const [user, setUser] = useState<any>(null);
  const name = user?.name || user?.email || "Гость";
  const image = user?.image as string | undefined;
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    let mounted = true
    fetch('/api/auth/session').then(r=> r.ok ? r.json() : null).then((s)=>{
      if (mounted) setUser((s?.user as any) || null)
    }).catch(()=>{})
    const onScroll = () => setElevated(window.scrollY > 2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`w-full sticky top-0 z-50 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 ${elevated? 'border-b shadow-sm' : 'border-b'}`}>
      {/* Desktop header */}
      <div className="hidden sm:flex mx-auto max-w-screen-xl px-4 h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="My Logoped" width={28} height={28} className="rounded" />
            <span className="font-semibold">My Logoped</span>
          </Link>
        </div>
        <nav className="flex items-center gap-4 text-sm text-gray-600">
          <Link href="#features" className="hover:text-gray-900">Возможности</Link>
          <Link href="#audience" className="hover:text-gray-900">Кому подходит</Link>
          <Link href="#screens" className="hover:text-gray-900">Скриншоты</Link>
          <Link href="#testimonials" className="hover:text-gray-900">Отзывы</Link>
          <Link href="#subscriptions" className="hover:text-gray-900">Тарифы</Link>
          <Link href="#faq" className="hover:text-gray-900">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/after-login" className="btn btn-secondary btn-sm">В кабинет</Link>
            </>
          ) : (
            <>
              <Link href="/register" className="btn btn-primary btn-sm">Начать бесплатно</Link>
              <Link href="/login" className="btn btn-outline btn-sm">Войти</Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile header */}
      <div className="sm:hidden mx-auto max-w-screen-xl px-4 h-14 grid grid-cols-2 items-center">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="My Logoped" width={28} height={28} className="rounded" />
          <span className="font-semibold">My Logoped</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2">
            {image ? (
              <Image src={image} alt={name} width={28} height={28} className="rounded-full object-cover" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600">{String(name||'Г')[0]?.toUpperCase?.()||'Г'}</div>
            )}
            <span className="text-sm max-w-[120px] truncate">{name}</span>
          </div>
          {user ? (
            <Link href="/after-login" className="btn btn-secondary btn-xs">В кабинет</Link>
          ) : (
            <Link href="/login" className="btn btn-primary btn-xs">Войти</Link>
          )}
        </div>
      </div>
    </header>
  );
}
