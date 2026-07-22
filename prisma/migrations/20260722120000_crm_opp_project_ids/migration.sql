-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "crmOpportunityId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "crmProjectId" TEXT;
ALTER TABLE "Project" ADD COLUMN "crmPrjNumber" TEXT;

-- CreateIndex
CREATE INDEX "Opportunity_crmOpportunityId_idx" ON "Opportunity"("crmOpportunityId");

-- CreateIndex
CREATE INDEX "Project_crmProjectId_idx" ON "Project"("crmProjectId");

-- CreateIndex
CREATE INDEX "Project_crmPrjNumber_idx" ON "Project"("crmPrjNumber");
