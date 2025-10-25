"use client";
import React, { useEffect, useState } from "react";

// Lightweight PWA install hint. Appears on mobile only, can be dismissed.
export default function InstallHint() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [promptEvent, setPromptEvent] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // don't show on desktop
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarse) return;
    if (localStorage.getItem('pwa.install.dismissed') === '1') return;

    // iOS detection (Safari)
    const ua = window.navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isStandalone = (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator as any).standalone;

    if (isIOS) {
      setIos(true);
      setVisible(!isStandalone);
      return;
    }

    // Android: use beforeinstallprompt
    const handler = (e: any) => {
      e.preventDefault();
      setPromptEvent(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler as any);

    // Some browsers already eligible - show passive hint
    setTimeout(() => {
      if (!promptEvent) setVisible(true);
    }, 1500);

    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, [promptEvent]);

  if (!visible) return null;

  const dismiss = () => { localStorage.setItem('pwa.install.dismissed', '1'); setVisible(false); };

  const install = async () => {
    if (!promptEvent) { dismiss(); return; }
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {}
    dismiss();
  };

  return (
    <div className="mx-auto max-w-screen-sm px-4 pb-6">
      <div className="rounded-2xl border glass hover-card p-3">
        <div className="shine" />
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">Л</div>
          <div className="flex-1">
            <div className="font-semibold">Установите приложение</div>
            <div className="text-xs text-gray-600 mt-0.5">
              {ios ? (
                <span>Откройте меню «Поделиться» и выберите «На экран Домой», чтобы установить.</span>
              ) : (
                <span>Добавьте «Logoped» на главный экран для быстрого доступа.</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!ios && <button onClick={install} className="btn btn-primary btn-sm btn-shine">Установить</button>}
            <button onClick={dismiss} className="btn btn-outline btn-sm">Позже</button>
          </div>
        </div>
      </div>
    </div>
  );
}
