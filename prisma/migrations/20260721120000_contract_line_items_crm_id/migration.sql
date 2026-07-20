-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "crmContractId" TEXT;

-- CreateTable
CREATE TABLE "ContractLineItem" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "version" TEXT,
    "amount" TEXT,
    "currency" TEXT,
    "cycleYears" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_crmContractId_idx" ON "Contract"("crmContractId");

-- CreateIndex
CREATE INDEX "ContractLineItem_contractId_idx" ON "ContractLineItem"("contractId");

-- AddForeignKey
ALTER TABLE "ContractLineItem" ADD CONSTRAINT "ContractLineItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
