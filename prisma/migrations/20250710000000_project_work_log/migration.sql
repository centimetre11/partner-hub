-- CreateTable
CREATE TABLE "ProjectWorkLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectWorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectWorkLog_projectId_idx" ON "ProjectWorkLog"("projectId");

-- CreateIndex
CREATE INDEX "ProjectWorkLog_authorId_idx" ON "ProjectWorkLog"("authorId");

-- CreateIndex
CREATE INDEX "ProjectWorkLog_createdAt_idx" ON "ProjectWorkLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ProjectWorkLog" ADD CONSTRAINT "ProjectWorkLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkLog" ADD CONSTRAINT "ProjectWorkLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
