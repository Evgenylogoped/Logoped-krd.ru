"use client";
import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // В dev не регистрируем SW, чтобы избежать кэширования старых бандлов и ошибок server actions
    if (process.env.NODE_ENV !== 'production') return;
    if ('serviceWorker' in navigator) {
      const register = async () => {
        try {
          await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        } catch (e) {
          // ignore
        }
      };
      register();
    }
  }, []);
  return null;
}
