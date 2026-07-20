-- CreateTable
CREATE TABLE "CrmChannel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT,
    "status" TEXT,
    "province" TEXT,
    "countryCn" TEXT,
    "city" TEXT,
    "region" TEXT,
    "zone" TEXT,
    "rank" TEXT,
    "source" TEXT,
    "sourceDetail" TEXT,
    "phone" TEXT,
    "contName" TEXT,
    "contEmail" TEXT,
    "contDuty" TEXT,
    "salesman" TEXT,
    "typeDetail" TEXT,
    "overseaAgent" TEXT,
    "contRecdate" TIMESTAMP(3),
    "staSalesOld" TEXT,
    "staRecdate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSyncLog" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "rangeStart" TEXT,
    "rangeEnd" TEXT,
    "rowCount" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmChannel_staRecdate_idx" ON "CrmChannel"("staRecdate");

-- CreateIndex
CREATE INDEX "CrmChannel_salesman_idx" ON "CrmChannel"("salesman");

-- CreateIndex
CREATE INDEX "CrmChannel_typeDetail_idx" ON "CrmChannel"("typeDetail");

-- CreateIndex
CREATE INDEX "CrmChannel_status_idx" ON "CrmChannel"("status");

-- CreateIndex
CREATE INDEX "ChannelSyncLog_createdAt_idx" ON "ChannelSyncLog"("createdAt");

-- CreateIndex
CREATE INDEX "ChannelSyncLog_mode_idx" ON "ChannelSyncLog"("mode");
