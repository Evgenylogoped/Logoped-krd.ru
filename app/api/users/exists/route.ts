import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const email = String(searchParams.get('email') || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ exists: false })
    const user = await prisma.user.findUnique({ where: { email } })
    return NextResponse.json({ exists: !!user })
  } catch (e) {
    return NextResponse.json({ exists: false }, { status: 200 })
  }
}
