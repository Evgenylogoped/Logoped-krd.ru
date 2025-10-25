"use client";
import React from "react";
import MobileAppShell from "@/components/mobile/MobileAppShell";
import type { BottomTab } from "@/components/mobile/MobileBottomNav";

export default function ParentMobileLayout({ children }: { children: React.ReactNode }) {
  const tabs: BottomTab[] = [
    { key: "home", href: "/parent/home", label: "Домой", icon: "🏠" },
    { key: "schedule", href: "/parent/schedule", label: "Распис.", icon: "🗓️" },
    { key: "messages", href: "/parent/messages", label: "Чаты", icon: "💬" },
    { key: "payments", href: "/parent/payments", label: "Платежи", icon: "💳" },
    { key: "profile", href: "/parent/profile", label: "Профиль", icon: "🙂" },
  ];

  return (
    <MobileAppShell
      title="Родитель"
      subtitle="Добро пожаловать"
      tabs={tabs}
      notificationsCount={0}
      fab={null}
    >
      {children}
    </MobileAppShell>
  );
}
