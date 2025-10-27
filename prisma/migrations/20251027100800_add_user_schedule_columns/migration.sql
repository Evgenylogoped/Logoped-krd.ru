-- Add schedule-related columns to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "scheduleMode" TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS "scheduleFloatingConfig" JSONB NULL;
