-- AlterTable
ALTER TABLE "SystemEventLog" ADD COLUMN IF NOT EXISTS "project" TEXT NOT NULL DEFAULT 'partner-hub';
ALTER TABLE "SystemEventLog" ADD COLUMN IF NOT EXISTS "ipHash" TEXT;
ALTER TABLE "SystemEventLog" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserBehaviorLog" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL DEFAULT 'partner-hub',
    "userId" TEXT,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "pagePath" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "meta" TEXT,
    "ipHash" TEXT,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBehaviorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBehaviorLog_createdAt_idx" ON "UserBehaviorLog"("createdAt");
CREATE INDEX IF NOT EXISTS "UserBehaviorLog_project_createdAt_idx" ON "UserBehaviorLog"("project", "createdAt");
CREATE INDEX IF NOT EXISTS "UserBehaviorLog_eventType_createdAt_idx" ON "UserBehaviorLog"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "UserBehaviorLog_userId_createdAt_idx" ON "UserBehaviorLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "UserBehaviorLog_action_createdAt_idx" ON "UserBehaviorLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "UserBehaviorLog_pagePath_createdAt_idx" ON "UserBehaviorLog"("pagePath", "createdAt");
CREATE INDEX IF NOT EXISTS "UserBehaviorLog_sessionId_createdAt_idx" ON "UserBehaviorLog"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "SystemEventLog_project_createdAt_idx" ON "SystemEventLog"("project", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UserBehaviorLog" ADD CONSTRAINT "UserBehaviorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
