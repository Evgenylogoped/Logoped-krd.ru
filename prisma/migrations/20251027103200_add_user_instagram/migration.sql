-- Add instagram column to User if missing
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "instagram" TEXT NULL;
