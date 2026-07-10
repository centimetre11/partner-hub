-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Partner_parentId_idx" ON "Partner"("parentId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
