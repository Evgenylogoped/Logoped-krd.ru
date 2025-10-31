-- CreateEnum
CREATE TYPE "PushType" AS ENUM ('MSG_NEW', 'BOOKING_UPDATE', 'PAYMENT_STATUS', 'ADMIN_BROADCAST');

-- CreateTable: UserNotificationPreference
CREATE TABLE "UserNotificationPreference" (
  "userId" TEXT PRIMARY KEY,
  "msgNew" BOOLEAN NOT NULL DEFAULT true,
  "bookingUpdate" BOOLEAN NOT NULL DEFAULT true,
  "paymentStatus" BOOLEAN NOT NULL DEFAULT true,
  "adminBroadcast" BOOLEAN NOT NULL DEFAULT true,
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
  "quietFromMsk" INTEGER NOT NULL DEFAULT 22,
  "quietToMsk" INTEGER NOT NULL DEFAULT 8,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: PushEventQueue
CREATE TABLE "PushEventQueue" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" "PushType" NOT NULL,
  "payload" JSONB NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushEventQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: PushDeliveryLog
CREATE TABLE "PushDeliveryLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" "PushType" NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDeliveryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "PushEventQueue_user_scheduled_idx" ON "PushEventQueue" ("userId", "scheduledAt");
CREATE INDEX "PushEventQueue_nextRetry_idx" ON "PushEventQueue" ("nextRetryAt");
CREATE INDEX "PushDeliveryLog_user_created_idx" ON "PushDeliveryLog" ("userId", "createdAt");
