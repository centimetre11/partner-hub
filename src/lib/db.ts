import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// SQLite holds a single database-level write lock. Multiple writers (the
// crm/leads/agent schedulers, the wecom-bot process, and user-triggered server
// actions) all contend for it, so a write that lands during a long scheduler
// transaction would otherwise fail immediately with SQLITE_BUSY and silently
// drop the record. Raising busy_timeout makes such writes wait for the lock
// (up to 15s) instead of failing.
if (process.env.DATABASE_URL?.startsWith("file:")) {
  db.$executeRawUnsafe("PRAGMA busy_timeout = 15000").catch(() => {});
}
