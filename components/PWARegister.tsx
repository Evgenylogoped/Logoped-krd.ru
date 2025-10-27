"use client";
import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Временный хотфикс: полностью отключаем Service Worker и чистим кэши,
    // чтобы устранить проблемы со старыми чанками/стилями у пользователей.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      }).catch(() => {});
    }
    try {
      // Очистить все кэши, если доступны
      // eslint-disable-next-line no-restricted-globals
      if (typeof caches !== 'undefined' && caches?.keys) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {})
      }
    } catch {}
  }, []);
  return null;
}
