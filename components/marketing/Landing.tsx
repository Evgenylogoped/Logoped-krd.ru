 "use client";
 import dynamic from "next/dynamic";
 import { Suspense } from "react";

 // Лёгкие блоки — обычный импорт
 const MarketingHeader = dynamic(() => import("@/components/marketing/Header"));
 const Hero = dynamic(() => import("@/components/marketing/Hero"));
 const Features = dynamic(() => import("@/components/marketing/Features"));
 const Audience = dynamic(() => import("@/components/marketing/Audience"));
const Subscriptions = dynamic(() => import("@/components/marketing/Subscriptions"));
 const FAQ = dynamic(() => import("@/components/marketing/FAQ"));
 const InstallHint = dynamic(() => import("@/components/marketing/InstallHint"));
 const Footer = dynamic(() => import("@/components/marketing/Footer"));

 // Потенциально тяжёлые секции — без SSR и с ленивой загрузкой
 const Screens = dynamic(() => import("@/components/marketing/Screens"), { ssr: false });
 const Testimonials = dynamic(() => import("@/components/marketing/Testimonials"), { ssr: false });

 export default function Landing() {
   return (
     <main>
       <MarketingHeader />
       <Hero />
       <section id="features"><Features /></section>
       <section id="audience"><Audience /></section>
       <Suspense fallback={null}>
         <section id="screens"><Screens /></section>
       </Suspense>
       <Suspense fallback={null}>
         <section id="testimonials"><Testimonials /></section>
       </Suspense>
      <section id="subscriptions"><Subscriptions /></section>
       <section id="faq"><FAQ /></section>
       <InstallHint />
       <Footer />
     </main>
   );
 }
