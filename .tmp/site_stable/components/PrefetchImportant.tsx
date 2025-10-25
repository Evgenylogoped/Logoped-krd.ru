"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PrefetchImportant() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => doPrefetch(router), { timeout: 2000 });
    } else {
      setTimeout(() => doPrefetch(router), 500);
    }
  }, [router]);
  return null;
}

function doPrefetch(router: ReturnType<typeof useRouter>) {
  try {
    const targets = ['/login', '/register', '/after-login', '/logoped/today', '/parent', '/admin'];
    for (const t of targets) router.prefetch(t);
  } catch {}
}
