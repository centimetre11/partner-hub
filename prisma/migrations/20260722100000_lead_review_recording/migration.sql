-- AlterTable
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "recordingPath" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "recordingMimeType" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "recordingBytes" INTEGER;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "recordingStartedAt" TIMESTAMP(3);
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "recordingEndedAt" TIMESTAMP(3);
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "transcriptStatus" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "transcriptError" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "transcriptText" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "transcriptJson" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "xfyunTranscriptText" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "xfyunTranscriptJson" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "xfyunLiveNotes" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "tencentTranscriptText" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "tencentTranscriptJson" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "tencentLiveNotes" TEXT;
ALTER TABLE "LeadReviewMeeting" ADD COLUMN IF NOT EXISTS "matchSource" TEXT;

-- AlterTable
ALTER TABLE "LeadReviewItem" ADD COLUMN IF NOT EXISTS "markerInsertedAt" TIMESTAMP(3);
