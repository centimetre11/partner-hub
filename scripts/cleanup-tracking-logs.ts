import { db } from "../src/lib/db";

const RETENTION_DAYS = 90;

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  const [behaviorResult, systemResult] = await Promise.all([
    db.userBehaviorLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.systemEventLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);

  console.log(`Cleanup completed. Cutoff: ${cutoff.toISOString()}`);
  console.log(`  UserBehaviorLog deleted: ${behaviorResult.count}`);
  console.log(`  SystemEventLog deleted: ${systemResult.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
