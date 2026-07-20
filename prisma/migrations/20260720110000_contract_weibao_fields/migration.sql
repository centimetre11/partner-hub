-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "parentContractId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "weibaoRatePct" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "weibaoIncludedY1" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Contract_parentContractId_idx" ON "Contract"("parentContractId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
