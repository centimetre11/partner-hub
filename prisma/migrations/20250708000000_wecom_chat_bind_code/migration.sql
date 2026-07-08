-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "wecomChatBindCode" TEXT;
ALTER TABLE "Partner" ADD COLUMN "wecomChatBindCodeExpiresAt" DATETIME;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "wecomChatBindCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "wecomChatBindCodeExpiresAt" DATETIME;
