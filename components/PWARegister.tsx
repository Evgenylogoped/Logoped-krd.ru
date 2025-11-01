"use client";
import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (async () => {
      try {
        if (!('serviceWorker' in navigator)) return;
        // Register service worker if not present
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) reg = await navigator.serviceWorker.register('/sw.js');

        // If user already granted notifications, ensure a subscription exists
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const existing = await reg.pushManager.getSubscription();
            if (!existing) {
              // Fetch VAPID public key
              const res = await fetch('/api/push/public-key');
              if (!res.ok) return;
              const j = await res.json();
              const key: string = (j && j.key) || '';
              if (!key) return;
              // Convert key
              const padding = '='.repeat((4 - (key.length % 4)) % 4);
              const base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/');
              const rawData = atob(base64);
              const applicationServerKey = new Uint8Array(rawData.length);
              for (let i = 0; i < rawData.length; i++) applicationServerKey[i] = rawData.charCodeAt(i);

              const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
              const body = JSON.stringify({ endpoint: sub.endpoint, keys: (sub.toJSON() as any).keys, userAgent: navigator.userAgent, platform: (navigator as any).platform || '' });
              await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
            }
          } catch {}
        }
      } catch {}
    })();
  }, []);
  return null;
}
