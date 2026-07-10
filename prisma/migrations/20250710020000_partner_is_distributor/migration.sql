-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "isDistributor" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Partner_isDistributor_idx" ON "Partner"("isDistributor");
