-- CreateTable
CREATE TABLE "LeadReviewMeeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "configJson" TEXT,
    "liveNotes" TEXT,
    "prepGeneratedAt" TIMESTAMP(3),
    "previewToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadReviewMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadReviewItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "channelId" TEXT,
    "leadId" TEXT,
    "displayName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "discussedAt" TIMESTAMP(3),
    "prepBrief" TEXT,
    "coreNotes" TEXT,
    "verdict" TEXT,
    "confirmedSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadReviewTodoDraft" (
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

    CONSTRAINT "LeadReviewTodoDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadReviewMeeting_previewToken_key" ON "LeadReviewMeeting"("previewToken");

-- CreateIndex
CREATE INDEX "LeadReviewMeeting_status_idx" ON "LeadReviewMeeting"("status");

-- CreateIndex
CREATE INDEX "LeadReviewMeeting_createdById_idx" ON "LeadReviewMeeting"("createdById");

-- CreateIndex
CREATE INDEX "LeadReviewItem_meetingId_sortOrder_idx" ON "LeadReviewItem"("meetingId", "sortOrder");

-- CreateIndex
CREATE INDEX "LeadReviewItem_channelId_idx" ON "LeadReviewItem"("channelId");

-- CreateIndex
CREATE INDEX "LeadReviewItem_leadId_idx" ON "LeadReviewItem"("leadId");

-- CreateIndex
CREATE INDEX "LeadReviewItem_source_idx" ON "LeadReviewItem"("source");

-- CreateIndex
CREATE INDEX "LeadReviewItem_status_idx" ON "LeadReviewItem"("status");

-- CreateIndex
CREATE INDEX "LeadReviewTodoDraft_itemId_idx" ON "LeadReviewTodoDraft"("itemId");

-- AddForeignKey
ALTER TABLE "LeadReviewMeeting" ADD CONSTRAINT "LeadReviewMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadReviewItem" ADD CONSTRAINT "LeadReviewItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "LeadReviewMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadReviewItem" ADD CONSTRAINT "LeadReviewItem_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CrmChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadReviewItem" ADD CONSTRAINT "LeadReviewItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadReviewTodoDraft" ADD CONSTRAINT "LeadReviewTodoDraft_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LeadReviewItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
