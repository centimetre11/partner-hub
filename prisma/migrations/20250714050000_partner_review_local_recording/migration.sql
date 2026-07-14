-- AlterTable
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "recordingPath" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "recordingMimeType" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "recordingBytes" INTEGER;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "recordingStartedAt" TIMESTAMP(3);
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "recordingEndedAt" TIMESTAMP(3);
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "transcriptStatus" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "transcriptError" TEXT;
