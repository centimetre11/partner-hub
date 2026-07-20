-- Rename buyout Weibao fields → product maintenance (对称于项目维保)
ALTER TABLE "Contract" RENAME COLUMN "weibaoRatePct" TO "productMaintRatePct";
ALTER TABLE "Contract" RENAME COLUMN "weibaoIncludedY1" TO "productMaintIncludedY1";

-- Legacy type code MAINTENANCE → PRODUCT_MAINTENANCE（与 PROJECT_MAINTENANCE 区分）
UPDATE "Contract" SET "contractType" = 'PRODUCT_MAINTENANCE' WHERE "contractType" = 'MAINTENANCE';
