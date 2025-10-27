import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
// Auth/UI providers are imported dynamically when NEXTAUTH_SECRET is available
// next-auth can be unavailable during static builds; avoid hard import for TS

export const dynamic = 'force-dynamic'

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: 'My Logoped — платформа для логопедов, родителей и организаций',
    template: '%s · My Logoped',
  },
  description: 'My Logoped — расписание, консультации, записи и платежи. Красиво, просто и мобильно.',
  metadataBase: new URL('https://logoped-krd.ru'),
  openGraph: {
    title: 'My Logoped — платформа для логопедов, родителей и организаций',
    description: 'My Logoped — расписание, записи, абонементы, чаты и выплаты — всё в одном удобном приложении.',
    siteName: 'My Logoped',
    url: 'https://logoped-krd.ru',
    type: 'website',
    images: [
      { url: '/og.png', width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'My Logoped — платформа для логопедов, родителей и организаций',
    description: 'My Logoped — расписание, записи, абонементы, чаты и выплаты — всё в одном удобном приложении.',
    images: ['/og.png'],
  },
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon-180.png' }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let s: any = null
  try {
    const na = 'next-auth' as const
    const mod = await import(na as any).catch(() => null as any)
    const auth = await import("@/lib/auth").catch(() => null as any)
    if (mod?.getServerSession && auth?.authOptions) {
      const session = await mod.getServerSession(auth.authOptions)
      s = session as any
    }
  } catch {}
  const initialTheme = (s?.user?.theme as string | undefined) || 'default'
  const isAuthed = !!(s?.user as any)?.id

  // Always render full layout; we already guarded dynamic next-auth imports with try/catch above

  // NEXTAUTH_SECRET is present: import full UI stack lazily to avoid build-time module evaluation
  const [AuthProvider, NavBar, MobileTabBar, PWARegister, PrefetchImportant, DesktopSidebar, MobileAutoRedirect] = await Promise.all([
    import("@/components/AuthProvider").then(m => m.default),
    import("@/components/NavBar").then(m => m.default),
    import("@/components/mobile/MobileTabBar").then(m => m.default),
    import("@/components/PWARegister").then(m => m.default),
    import("@/components/PrefetchImportant").then(m => m.default),
    import("@/components/desktop/DesktopSidebar").then(m => m.default),
    import("@/components/mobile/MobileAutoRedirect").then(m => m.default),
  ])

  return (
    <html lang="ru" suppressHydrationWarning data-theme={initialTheme}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="color-scheme" content="light" />
        {/* iOS PWA fullscreen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="My Logoped" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#4f46e5" />
        {/* Open Graph / Twitter */}
        <meta property="og:title" content="My Logoped" />
        <meta property="og:description" content="My Logoped — расписание, записи, абонементы, чаты и выплаты — всё в одном удобном приложении." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/og.png" />
        <meta property="og:site_name" content="My Logoped" />
        <meta property="og:url" content="https://logoped-krd.ru" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="My Logoped" />
        <meta name="twitter:description" content="My Logoped — расписание, записи, абонементы, чаты и выплаты — всё в одном удобном приложении." />
        <meta name="twitter:image" content="/og.png" />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      >
        {/* iOS zoom guard */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try{
                  var lastTouchEnd = 0;
                  document.addEventListener('gesturestart', function(e){ e.preventDefault() }, { passive: false });
                  document.addEventListener('dblclick', function(e){ e.preventDefault() }, { passive: false });
                  document.addEventListener('touchend', function(e){
                    var now = Date.now();
                    if (now - lastTouchEnd <= 300) { e.preventDefault() }
                    lastTouchEnd = now;
                  }, { passive: false });
                }catch(e){}
              })();
            `
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var applyTheme=function(){var t=localStorage.getItem('theme')||'${initialTheme || 'default'}';if(document.documentElement.getAttribute('data-theme')!==t){document.documentElement.setAttribute('data-theme',t)}};applyTheme();setTimeout(applyTheme,100);setTimeout(applyTheme,1000);window.addEventListener('storage',function(e){if(e.key==='theme') applyTheme()});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible') applyTheme()});if(localStorage.getItem('sidebar.pinned')==='1'){document.body.classList.add('sidebar-pinned')}}catch(e){}`
          }}
        />
        <AuthProvider>
          {isAuthed ? (
            <>
              {/* Десктоп-сайдбар (роль/город с сервера, чтобы не ждать клиентскую сессию) */}
              <Suspense fallback={null}>
                <DesktopSidebar role={(s?.user as any)?.role as string | undefined} city={(s?.user as any)?.city as string | undefined} />
              </Suspense>
              <Suspense fallback={null}>
                <NavBar />
              </Suspense>
              {children}
              <PWARegister />
              <PrefetchImportant />
              <Suspense fallback={null}>
                <MobileAutoRedirect />
              </Suspense>
              {/* Нижняя таб-панель для мобильных */}
              <div className="md:hidden h-14" />
              <Suspense fallback={null}>
                <MobileTabBar role={(s?.user as any)?.role as string | undefined} />
              </Suspense>
            </>
          ) : (
            <>
              {children}
              <PWARegister />
              <PrefetchImportant />
            </>
          )}
        </AuthProvider>
      </body>
    </html>
  );
}