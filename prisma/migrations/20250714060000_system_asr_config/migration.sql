-- CreateTable
CREATE TABLE "SystemAsrConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "realtimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "chunkSeconds" INTEGER NOT NULL DEFAULT 12,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "basePrompt" TEXT,
    "hotwords" TEXT,
    "correctionRules" TEXT,
    "llmCorrectEnabled" BOOLEAN NOT NULL DEFAULT true,
    "includePartnerNames" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemAsrConfig_pkey" PRIMARY KEY ("id")
);
