"use client";
import React from "react";
import dynamic from "next/dynamic";
const MobileUserBadge = dynamic(() => import("@/components/mobile/MobileUserBadge"), { ssr: false });
import Link from "next/link";

export default function MobilePageHeader({
  title,
  right,
  backHref,
  subtitle,
  notificationsCount,
}: {
  title: string | React.ReactNode;
  right?: React.ReactNode;
  backHref?: string;
  subtitle?: string;
  notificationsCount?: number;
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b">
      <div className="max-w-screen-md mx-auto flex items-center gap-2 px-3 py-2 relative">
        {backHref ? (
          <Link
            href={backHref}
            className="shrink-0 rounded-md border px-2 py-1 text-sm text-muted hover:bg-gray-50"
            aria-label="Назад"
          >
            ←
          </Link>
        ) : (
          <Link
            href="/notifications"
            className="relative shrink-0 rounded-md border px-2 py-1 text-sm text-muted hover:bg-gray-50"
            aria-label="Уведомления"
          >
            🔔
            {notificationsCount ? (
              <span className="absolute -top-1 -right-1 inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px]">
                {notificationsCount}
              </span>
            ) : null}
          </Link>
        )}
        <div className="flex min-w-0 flex-col">
          <div className="truncate font-semibold text-base leading-tight">{title}</div>
          {subtitle ? (
            <div className="truncate text-[12px] text-muted leading-tight">{subtitle}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 absolute right-3 top-2 md:static md:ml-auto">{right ?? (<Link href="/" prefetch={false} className="btn btn-ghost active:scale-95 transition"><MobileUserBadge /></Link>)}</div>
      </div>
    </header>
  );
}
