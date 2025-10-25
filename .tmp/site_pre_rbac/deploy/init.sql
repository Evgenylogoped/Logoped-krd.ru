-- PostgreSQL init script for logoped-krd (NovikovDom)
-- Creates DB, role, and prepares schema. For full schema, run Prisma migration inside app container.

-- 1) Create role and database (idempotent style)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app'
  ) THEN
    CREATE ROLE app LOGIN PASSWORD 'app';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'logoped'
  ) THEN
    CREATE DATABASE logoped OWNER app ENCODING 'UTF8';
  END IF;
END$$;

-- 2) Connect to DB
\c logoped

-- 3) Ensure extension for UUID if needed (Prisma uses cuid strings; keep for future)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 4) Placeholder: Prisma will create tables. Run inside container:
-- docker compose exec app npx prisma migrate deploy

-- 5) Create initial SUPER_ADMIN user (email/password must be replaced). Since Prisma manages hashing,
--    we insert a placeholder and recommend using an admin action to set password.
--    Alternatively, run a seed script in the app container.
-- Example seed via Prisma (inside app):
--   node -e "(async()=>{const{{prisma}}=await import('./lib/prisma.js');
--     const bcrypt=await import('bcrypt'); const hash=await bcrypt.hash('ChangeMe123!',10);
--     await prisma.user.upsert({ where:{email:'admin@logoped-krd.ru'}, update:{}, create:{ email:'admin@logoped-krd.ru', role:'SUPER_ADMIN', passwordHash: hash }});
--     process.exit(0)})()"
