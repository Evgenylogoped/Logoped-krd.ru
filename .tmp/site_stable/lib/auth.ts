import { PrismaAdapter } from '@next-auth/prisma-adapter'
import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import YandexProvider from 'next-auth/providers/yandex'
import VKProvider from 'next-auth/providers/vk'
import { prisma } from './prisma'
import bcrypt from 'bcrypt'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim()
        const password = credentials?.password || ''
        if (!email || !password) return null
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) return null
        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role } as any
      },
    }),
    // OAuth providers (conditionally enabled if env vars are present)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      }) as any,
    ] : []),
    ...(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET ? [
      YandexProvider({
        clientId: process.env.YANDEX_CLIENT_ID!,
        clientSecret: process.env.YANDEX_CLIENT_SECRET!,
      }) as any,
    ] : []),
    ...(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET ? [
      VKProvider({
        clientId: process.env.VK_CLIENT_ID!,
        clientSecret: process.env.VK_CLIENT_SECRET!,
      }) as any,
    ] : []),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = (user as any).id
        // прокидываем имя и аватар, если пришли от провайдера
        if ((user as any).name) (token as any).name = (user as any).name
        if ((user as any).image) (token as any).image = (user as any).image
        if ((user as any).theme) (token as any).theme = (user as any).theme
      }
      if (!token.id && token?.email) {
        const u = await prisma.user.findUnique({ where: { email: token.email } })
        if (u) {
          token.role = u.role
          token.id = u.id
          ;(token as any).name = u.name || (token as any).name
          ;(token as any).image = u.image || (token as any).image
          ;(token as any).theme = (u as any).theme || (token as any).theme
        }
      }
      return token as any
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token as any).role
        ;(session.user as any).id = (token as any).id
        // по возможности сразу выставим имя/аватар из токена
        if ((token as any).name) session.user.name = (token as any).name as any
        if ((token as any).image) (session.user as any).image = (token as any).image
        if ((token as any).theme) (session.user as any).theme = (token as any).theme
        // enrich with subscription fields for UI banners
        if ((session.user as any).id) {
          const u = await prisma.user.findUnique({ where: { id: (session.user as any).id as string } })
          if (u) {
            // актуализируем имя/аватар из БД
            session.user.name = (u.name || session.user.name || null) as any
            ;(session.user as any).image = u.image || (session.user as any).image || null
            ;(session.user as any).theme = (u as any)?.theme || (session.user as any).theme || null
            ;(session.user as any).betaExpiresAt = u.betaExpiresAt || null
            ;(session.user as any).activatedUntil = u.activatedUntil || null
            ;(session.user as any).activatedForever = u.activatedForever || false
            // counters for badges — heavy counts убираем из session callback,
            // чтобы не нагружать каждый рендер. Пусть страницы/виджеты
            // получают их через целевые API c кешированием.
            ;(session.user as any).badgeConsultIn = undefined
            ;(session.user as any).badgeConsultOut = undefined
            ;(session.user as any).badgeParentActivations = undefined
          }
        }
      }
      return session
    },
  },
}
