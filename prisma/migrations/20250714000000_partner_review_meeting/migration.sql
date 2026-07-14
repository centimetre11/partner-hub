-- CreateTable
CREATE TABLE "SystemDingTalkConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "corpId" TEXT,
    "appKey" TEXT NOT NULL,
    "appSecret" TEXT NOT NULL,
    "token" TEXT,
    "aesKey" TEXT,
    "agentId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemDingTalkConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerReviewMeeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "dingtalkRecordId" TEXT,
    "dingtalkConferenceId" TEXT,
    "dingtalkSpaceId" TEXT,
    "dingtalkFileId" TEXT,
    "transcriptText" TEXT,
    "liveNotes" TEXT,
    "prepGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerReviewMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerReviewItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "discussedAt" TIMESTAMP(3),
    "markerInsertedAt" TIMESTAMP(3),
    "prepBrief" TEXT,
    "coreNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerReviewTodoDraft" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "todoItemId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerReviewTodoDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerReviewMeeting_status_idx" ON "PartnerReviewMeeting"("status");

-- CreateIndex
CREATE INDEX "PartnerReviewMeeting_createdById_idx" ON "PartnerReviewMeeting"("createdById");

-- CreateIndex
CREATE INDEX "PartnerReviewMeeting_dingtalkRecordId_idx" ON "PartnerReviewMeeting"("dingtalkRecordId");

-- CreateIndex
CREATE INDEX "PartnerReviewItem_meetingId_sortOrder_idx" ON "PartnerReviewItem"("meetingId", "sortOrder");

-- CreateIndex
CREATE INDEX "PartnerReviewItem_partnerId_idx" ON "PartnerReviewItem"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerReviewItem_meetingId_partnerId_key" ON "PartnerReviewItem"("meetingId", "partnerId");

-- CreateIndex
CREATE INDEX "PartnerReviewTodoDraft_itemId_idx" ON "PartnerReviewTodoDraft"("itemId");

-- AddForeignKey
ALTER TABLE "PartnerReviewMeeting" ADD CONSTRAINT "PartnerReviewMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReviewItem" ADD CONSTRAINT "PartnerReviewItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PartnerReviewMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReviewItem" ADD CONSTRAINT "PartnerReviewItem_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReviewTodoDraft" ADD CONSTRAINT "PartnerReviewTodoDraft_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PartnerReviewItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
