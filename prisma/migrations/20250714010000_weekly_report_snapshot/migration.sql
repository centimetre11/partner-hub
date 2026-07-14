-- CreateTable
CREATE TABLE "WeeklyReportSnapshot" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "weekLabel" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'zh',
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyReportSnapshot_createdAt_idx" ON "WeeklyReportSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "WeeklyReportSnapshot_weekLabel_idx" ON "WeeklyReportSnapshot"("weekLabel");

-- CreateIndex
CREATE INDEX "WeeklyReportSnapshot_kind_createdAt_idx" ON "WeeklyReportSnapshot"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyReportSnapshot_userId_createdAt_idx" ON "WeeklyReportSnapshot"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyReportSnapshot_agentRunId_idx" ON "WeeklyReportSnapshot"("agentRunId");

-- AddForeignKey
ALTER TABLE "WeeklyReportSnapshot" ADD CONSTRAINT "WeeklyReportSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportSnapshot" ADD CONSTRAINT "WeeklyReportSnapshot_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
