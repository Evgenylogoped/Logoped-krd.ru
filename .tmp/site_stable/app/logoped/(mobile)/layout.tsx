"use client";
import React from "react";
import MobileAppShell from "@/components/mobile/MobileAppShell";
import type { BottomTab } from "@/components/mobile/MobileBottomNav";

export default function LogopedMobileLayout({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = React.useState<{ inboxPending: number; inboxNew: number; outboxPending: number } | null>(null);
  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch('/api/org-consultations/summary');
        const j = await r.json();
        if (!ignore && !j?.error) setSummary(j);
      } catch {}
    })();
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/org-consultations/summary');
        const j = await r.json();
        if (!j?.error) setSummary(j);
      } catch {}
    }, 30000);
    return () => { ignore = true; clearInterval(t); };
  }, []);

  const tabs: BottomTab[] = [
    { key: "schedule", href: "/logoped/schedule", label: "Распис.", icon: "🗓️" },
    { key: "clients", href: "/logoped/clients", label: "Клиенты", icon: "👥" },
    { key: "notifications", href: "/logoped/notifications", label: "Уведомл.", icon: "🔔" },
    { key: "chat", href: "/chat", label: "Чат", icon: "💬" },
    { key: "more", href: "/logoped/more", label: "Ещё", icon: "⋯" },
  ];

  return (
    <MobileAppShell
      title="Логопед"
      subtitle="Мобильный режим"
      tabs={tabs}
      notificationsCount={summary?.inboxNew || 0}
      fab={null}
    >
      {children}
    </MobileAppShell>
  );
}
