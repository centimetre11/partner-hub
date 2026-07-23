-- CreateTable
CREATE TABLE "PresalesProjectMeeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "attendeeUserIds" TEXT,
    "liveNotes" TEXT,
    "prepGeneratedAt" TIMESTAMP(3),
    "previewToken" TEXT,
    "transcriptText" TEXT,
    "transcriptJson" TEXT,
    "matchSource" TEXT,
    "tencentTranscriptText" TEXT,
    "tencentTranscriptJson" TEXT,
    "tencentLiveNotes" TEXT,
    "xfyunTranscriptText" TEXT,
    "xfyunTranscriptJson" TEXT,
    "xfyunLiveNotes" TEXT,
    "recordingPath" TEXT,
    "recordingMimeType" TEXT,
    "recordingBytes" INTEGER,
    "recordingStartedAt" TIMESTAMP(3),
    "recordingEndedAt" TIMESTAMP(3),
    "transcriptStatus" TEXT,
    "transcriptError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresalesProjectMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresalesProjectMeetingItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "discussedAt" TIMESTAMP(3),
    "markerInsertedAt" TIMESTAMP(3),
    "coreNotes" TEXT,
    "confirmedSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresalesProjectMeetingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresalesProjectMeetingTodoDraft" (
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

    CONSTRAINT "PresalesProjectMeetingTodoDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PresalesProjectMeeting_previewToken_key" ON "PresalesProjectMeeting"("previewToken");

-- CreateIndex
CREATE INDEX "PresalesProjectMeeting_status_idx" ON "PresalesProjectMeeting"("status");

-- CreateIndex
CREATE INDEX "PresalesProjectMeeting_createdById_idx" ON "PresalesProjectMeeting"("createdById");

-- CreateIndex
CREATE INDEX "PresalesProjectMeetingItem_meetingId_sortOrder_idx" ON "PresalesProjectMeetingItem"("meetingId", "sortOrder");

-- CreateIndex
CREATE INDEX "PresalesProjectMeetingItem_userId_idx" ON "PresalesProjectMeetingItem"("userId");

-- CreateIndex
CREATE INDEX "PresalesProjectMeetingItem_customerId_idx" ON "PresalesProjectMeetingItem"("customerId");

-- CreateIndex
CREATE INDEX "PresalesProjectMeetingItem_projectId_idx" ON "PresalesProjectMeetingItem"("projectId");

-- CreateIndex
CREATE INDEX "PresalesProjectMeetingItem_status_idx" ON "PresalesProjectMeetingItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PresalesProjectMeetingItem_meetingId_userId_projectId_key" ON "PresalesProjectMeetingItem"("meetingId", "userId", "projectId");

-- CreateIndex
CREATE INDEX "PresalesProjectMeetingTodoDraft_itemId_idx" ON "PresalesProjectMeetingTodoDraft"("itemId");

-- AddForeignKey
ALTER TABLE "PresalesProjectMeeting" ADD CONSTRAINT "PresalesProjectMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesProjectMeetingItem" ADD CONSTRAINT "PresalesProjectMeetingItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PresalesProjectMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesProjectMeetingItem" ADD CONSTRAINT "PresalesProjectMeetingItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesProjectMeetingItem" ADD CONSTRAINT "PresalesProjectMeetingItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesProjectMeetingItem" ADD CONSTRAINT "PresalesProjectMeetingItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesProjectMeetingTodoDraft" ADD CONSTRAINT "PresalesProjectMeetingTodoDraft_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PresalesProjectMeetingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
