/**
 * One-time customer merge: reassign child FKs from lose → keep, merge scalars, delete lose.
 *
 * Usage:
 *   npx tsx scripts/merge-customers.ts --keep <id> --lose <id> [--dry-run]
 *   npx tsx scripts/merge-customers.ts --dawiyat   # hardcoded Dawiyat duplicates
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const db = new PrismaClient();

const DAWIYAT_KEEP = "cmrlzafpn0009qlbazlr54rqh"; // CRM + partner + owner
const DAWIYAT_LOSE = "cmqxeqoqp0011rxbc5fglbdd6"; // contacts + AI profile notes

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dryRun = process.argv.includes("--dry-run");
const useDawiyat = process.argv.includes("--dawiyat");
const keepId = useDawiyat ? DAWIYAT_KEEP : arg("--keep");
const loseId = useDawiyat ? DAWIYAT_LOSE : arg("--lose");

const CHILD_TABLES = [
  "contact",
  "contactLink",
  "opportunity",
  "project",
  "contract",
  "todoItem",
  "timelineEvent",
  "businessRecord",
  "training",
  "asset",
] as const;

type ChildDelegate = {
  count: (args: { where: { customerId: string } }) => Promise<number>;
  updateMany: (args: {
    where: { customerId: string };
    data: { customerId: string };
  }) => Promise<{ count: number }>;
};

async function main() {
  if (!keepId || !loseId) {
    console.error("Usage: npx tsx scripts/merge-customers.ts --keep <id> --lose <id> [--dry-run]");
    console.error("   or: npx tsx scripts/merge-customers.ts --dawiyat [--dry-run]");
    process.exit(1);
  }
  if (keepId === loseId) {
    console.error("keep and lose must differ");
    process.exit(1);
  }

  const [keep, lose] = await Promise.all([
    db.customer.findUnique({ where: { id: keepId } }),
    db.customer.findUnique({ where: { id: loseId } }),
  ]);
  if (!keep || !lose) {
    console.error("Customer not found", { keep: !!keep, lose: !!lose, keepId, loseId });
    process.exit(1);
  }

  console.log("KEEP:", keep.id, keep.name, keep.crmCustomerId ?? "(no crm)", keep.city, keep.country);
  console.log("LOSE:", lose.id, lose.name, lose.crmCustomerId ?? "(no crm)", lose.city, lose.country);

  const counts: Record<string, number> = {};
  for (const table of CHILD_TABLES) {
    const delegate = db[table] as unknown as ChildDelegate;
    counts[table] = await delegate.count({ where: { customerId: loseId } });
  }
  const partnerLinks = await db.customerPartner.findMany({
    where: { customerId: loseId },
    select: { id: true, partnerId: true, relation: true },
  });
  const loseWecom = await db.wecomChat.findUnique({ where: { customerId: loseId } });
  const keepWecom = await db.wecomChat.findUnique({ where: { customerId: keepId } });
  const loseArr = await db.arrCustomerProfile.findUnique({
    where: { customerId: loseId },
    include: { cells: true },
  });
  const keepArr = await db.arrCustomerProfile.findUnique({ where: { customerId: keepId } });

  console.log("Lose child counts:", counts);
  console.log("Lose partnerLinks:", partnerLinks.length, "wecom:", !!loseWecom, "arr:", !!loseArr);

  if (dryRun) {
    console.log("[dry-run] no writes");
    return;
  }

  await db.$transaction(async (tx) => {
    // Partner links: skip if keep already has same partnerId
    for (const link of partnerLinks) {
      const exists = await tx.customerPartner.findUnique({
        where: {
          customerId_partnerId: { customerId: keepId, partnerId: link.partnerId },
        },
      });
      if (exists) {
        await tx.customerPartner.delete({ where: { id: link.id } });
      } else {
        await tx.customerPartner.update({
          where: { id: link.id },
          data: { customerId: keepId },
        });
      }
    }

    // WecomChat: at most one per customer
    if (loseWecom) {
      if (keepWecom) {
        await tx.wecomChat.update({
          where: { id: loseWecom.id },
          data: { customerId: null },
        });
      } else {
        await tx.wecomChat.update({
          where: { id: loseWecom.id },
          data: { customerId: keepId },
        });
      }
    }

    // Arr profile: keep wins; drop lose profile (cascade cells)
    if (loseArr) {
      if (keepArr) {
        await tx.arrCustomerProfile.delete({ where: { id: loseArr.id } });
      } else {
        await tx.arrCustomerProfile.update({
          where: { id: loseArr.id },
          data: { customerId: keepId },
        });
      }
    }

    for (const table of CHILD_TABLES) {
      const delegate = tx[table] as unknown as ChildDelegate;
      await delegate.updateMany({
        where: { customerId: loseId },
        data: { customerId: keepId },
      });
    }

    // Soft refs in logs
    await tx.systemEventLog.updateMany({
      where: { targetType: "Customer", targetId: loseId },
      data: { targetId: keepId },
    });
    await tx.userBehaviorLog.updateMany({
      where: { targetType: "Customer", targetId: loseId },
      data: { targetId: keepId },
    });

    // Agents with queryConfig JSON containing loseId
    const agents = await tx.agent.findMany({
      where: { queryConfig: { contains: loseId } },
      select: { id: true, queryConfig: true },
    });
    for (const a of agents) {
      if (!a.queryConfig) continue;
      await tx.agent.update({
        where: { id: a.id },
        data: { queryConfig: a.queryConfig.split(loseId).join(keepId) },
      });
    }

    // Scalar merge: keep non-null wins; fill gaps from lose; prefer canonical geo/industry from lose when keep looks free-text
    const patch: Prisma.CustomerUpdateInput = {};
    const fill = <K extends keyof typeof keep>(key: K) => {
      if (keep[key] == null && lose[key] != null) {
        (patch as Record<string, unknown>)[key as string] = lose[key];
      }
    };
    for (const key of [
      "website",
      "scale",
      "contactName",
      "contactTitle",
      "contactPhone",
      "contactEmail",
      "notes",
      "q5Situation",
      "q5Trouble",
      "q5Order",
      "q5Cost",
      "q5Key",
      "kmsRootPath",
      "gdriveFolderUrl",
      "crmCustomerId",
      "creditCode",
      "mossSnapshot",
      "mossSyncedAt",
      "customerSegment",
      "buyingTrigger",
      "entryPath",
      "icpTier",
      "tier",
      "ownerId",
      "presalesUserId",
      "partnerId",
      "wecomChatBindCode",
      "wecomChatBindCodeExpiresAt",
    ] as const) {
      fill(key);
    }

    // Prefer taxonomy-style values from lose when keep has free-text variants
    if (lose.industry && (!keep.industry || /telecome/i.test(keep.industry))) {
      patch.industry = lose.industry;
    }
    if (lose.country && (!keep.country || keep.country.includes(" "))) {
      patch.country = lose.country;
    }
    if (lose.city && (!keep.city || /^[A-Za-z]/.test(keep.city)) && /[\u4e00-\u9fff]/.test(lose.city)) {
      patch.city = lose.city;
    }
    // If keep website empty already handled; if both set, keep keep's. Also merge notes if keep empty filled above.
    if (keep.notes && lose.notes && !keep.notes.includes(lose.notes.slice(0, 40))) {
      patch.notes = `${keep.notes}\n\n---\n${lose.notes}`;
    } else if (!keep.notes && lose.notes) {
      patch.notes = lose.notes;
    }
    if (keep.scale == null && lose.scale) patch.scale = lose.scale;

    if (Object.keys(patch).length) {
      await tx.customer.update({ where: { id: keepId }, data: patch });
    }

    await tx.customer.delete({ where: { id: loseId } });
  });

  const after = await db.customer.findUnique({
    where: { id: keepId },
    include: {
      _count: {
        select: {
          contacts: true,
          opportunities: true,
          projects: true,
          contracts: true,
          partnerLinks: true,
          events: true,
          businessRecords: true,
        },
      },
    },
  });
  console.log("Merged OK. Remaining customer:", after?.id, after?.name, after?._count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
