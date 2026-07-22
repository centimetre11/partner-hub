-- Customer Tier A/B/C（与伙伴同语义）；从旧 icpTier 回填
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tier" TEXT;

UPDATE "Customer"
SET "tier" = CASE
  WHEN "icpTier" = 'PRIMARY' THEN 'A'
  WHEN "icpTier" = 'NURTURE' THEN 'B'
  WHEN "icpTier" = 'WATCH' THEN 'C'
  ELSE "tier"
END
WHERE ("tier" IS NULL OR "tier" = '')
  AND "icpTier" IS NOT NULL
  AND "icpTier" <> '';

CREATE INDEX IF NOT EXISTS "Customer_tier_idx" ON "Customer"("tier");
