"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function MobileAutoRedirect() {
  const { data } = useSession();
  const role = (data?.user as any)?.role as string | undefined;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;
    if (!role) return;
    // Перенаправляем только с корня, чтобы не вмешиваться в навигацию (чат/настройки/и т.п.)
    if (pathname !== '/') return;
    if (role === 'PARENT') router.replace('/parent');
    if (role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN') router.replace('/logoped');
  }, [role, router, pathname]);

  return null;
}
