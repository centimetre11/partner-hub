-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "projectMaintRatePct" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "projectMaintIncludedY1" BOOLEAN NOT NULL DEFAULT false;

-- RenameForeignKey (relation rename only; keep same constraint if already present)
-- Prisma relation name ContractWeibaoChain → ContractRenewalChain does not change DB columns.
