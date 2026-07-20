-- AlterTable
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "matchSource" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "tencentTranscriptText" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "tencentTranscriptJson" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "tencentLiveNotes" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "xfyunTranscriptText" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "xfyunTranscriptJson" TEXT;
ALTER TABLE "PartnerReviewMeeting" ADD COLUMN "xfyunLiveNotes" TEXT;
