const { PrismaClient } = require('@prisma/client')
;(async ()=>{
  const prisma = new PrismaClient()
  try {
    const users = await prisma.user.findMany({ select: { id:true, email:true, role:true } })
    console.log(users)
  } finally {
    await prisma.$disconnect()
  }
})().catch(e=>{ console.error(e); process.exit(1) })
