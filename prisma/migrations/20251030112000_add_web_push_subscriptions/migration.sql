-- CreateTable
CREATE TABLE "WebPushSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL UNIQUE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "platform" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AddForeignKey
ALTER TABLE "WebPushSubscription"
  ADD CONSTRAINT "WebPushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "WebPushSubscription_userId_createdAt_idx" ON "WebPushSubscription"("userId", "createdAt");
