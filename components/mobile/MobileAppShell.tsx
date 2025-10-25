"use client";
import React from "react";
import MobilePageHeader from "./MobilePageHeader";
import MobileFAB from "./MobileFAB";
import MobileUserBadge from "@/components/mobile/MobileUserBadge";

export default function MobileAppShell({
  title,
  subtitle,
  notificationsCount,
  headerRight,
  backHref,
  tabs,
  fab,
  children,
}: {
  title: string | React.ReactNode;
  subtitle?: string;
  notificationsCount?: number;
  headerRight?: React.ReactNode;
  backHref?: string;
  tabs: any[];
  fab?: { icon?: React.ReactNode; label?: string; onClick?: () => void } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--background)]">
      <MobilePageHeader
        title={title}
        subtitle={subtitle}
        notificationsCount={notificationsCount}
        right={headerRight ?? <MobileUserBadge />}
        backHref={backHref}
      />
      <main className="max-w-screen-md mx-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+64px)]">
        {children}
      </main>
      {fab ? (
        <MobileFAB icon={fab.icon} label={fab.label} onClick={fab.onClick} />
      ) : null}
    </div>
  );
}
