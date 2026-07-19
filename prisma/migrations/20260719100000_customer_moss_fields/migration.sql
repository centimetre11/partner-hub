-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "creditCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "mossSnapshot" JSONB;
ALTER TABLE "Customer" ADD COLUMN "mossSyncedAt" TIMESTAMP(3);
