FROM node:22-alpine AS base

# ---- 依赖安装 ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- 构建 ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:./prisma/dev.db"
RUN npx prisma generate && npm run build

# ---- 运行 ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./

# 数据库放在挂载卷中，首次启动自动建表+导入种子数据
ENV DATABASE_URL="file:/data/partner-hub.db"
VOLUME /data
EXPOSE 3000

CMD ["sh", "-c", "npx tsx scripts/drop-legacy-industry.ts || true && npx prisma db push --accept-data-loss --skip-generate && npx tsx scripts/migrate-customer-partner-links.ts && npx tsx prisma/seed.ts && npx tsx scripts/migrate-system-en.ts && npx tsx scripts/normalize-tier.ts && npx tsx scripts/resync-scheduler-next-run.ts && npx next start"]
