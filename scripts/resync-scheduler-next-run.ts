import { computeNextRunAt } from "../src/lib/agent-runner";
import { db } from "../src/lib/db";

async function main() {
  const agents = await db.agent.findMany({
    where: { trigger: "SCHEDULE", isTemplate: false },
    select: {
      id: true,
      name: true,
      enabled: true,
      frequency: true,
      runHour: true,
      runWeekday: true,
      cronExpr: true,
      timezone: true,
      nextRunAt: true,
    },
  });

  for (const agent of agents) {
    const nextRunAt = agent.enabled ? computeNextRunAt(agent) : null;
    await db.agent.update({ where: { id: agent.id }, data: { nextRunAt } });
    console.log(
      `[resync] ${agent.name}: ${agent.nextRunAt?.toISOString() ?? "null"} -> ${nextRunAt?.toISOString() ?? "null"}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
