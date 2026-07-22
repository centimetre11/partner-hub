-- Partner list/kanban/pool filter indexes
CREATE INDEX IF NOT EXISTS "Partner_status_idx" ON "Partner"("status");
CREATE INDEX IF NOT EXISTS "Partner_status_pipelineStage_idx" ON "Partner"("status", "pipelineStage");
CREATE INDEX IF NOT EXISTS "Partner_status_tier_idx" ON "Partner"("status", "tier");
CREATE INDEX IF NOT EXISTS "Partner_status_poolFlag_idx" ON "Partner"("status", "poolFlag");
CREATE INDEX IF NOT EXISTS "Partner_ownerId_idx" ON "Partner"("ownerId");
CREATE INDEX IF NOT EXISTS "Partner_updatedAt_idx" ON "Partner"("updatedAt");

-- Todo overdue/dashboard/owner indexes
CREATE INDEX IF NOT EXISTS "TodoItem_partnerId_idx" ON "TodoItem"("partnerId");
CREATE INDEX IF NOT EXISTS "TodoItem_customerId_idx" ON "TodoItem"("customerId");
CREATE INDEX IF NOT EXISTS "TodoItem_status_dueDate_idx" ON "TodoItem"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "TodoItem_status_source_idx" ON "TodoItem"("status", "source");
CREATE INDEX IF NOT EXISTS "TodoItem_assigneeId_status_idx" ON "TodoItem"("assigneeId", "status");
