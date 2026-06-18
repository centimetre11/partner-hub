/**
 * One-time migration: normalize partner tier to A/B/C and clear legacy priority/fitScore.
 * Usage: npx tsx scripts/normalize-tier.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizePartnerTier, resolvePartnerTier } from "../src/lib/tier";

const db = new PrismaClient();

async function main() {
  const partners = await db.partner.findMany({
    select: { id: true, name: true, tier: true, priority: true, fitScore: true },
  });

  let updated = 0;
  for (const p of partners) {
    const resolved = resolvePartnerTier(p);
    const normalizedCurrent = normalizePartnerTier(p.tier);
    const needsTierFix = resolved !== normalizedCurrent || (resolved && p.tier !== resolved);
    const needsLegacyClear = p.priority != null || p.fitScore != null;

    if (!needsTierFix && !needsLegacyClear) continue;

    await db.partner.update({
      where: { id: p.id },
      data: {
        tier: resolved,
        priority: null,
        fitScore: null,
      },
    });

    const from = [p.tier, p.priority ? `priority=${p.priority}` : null, p.fitScore != null ? `fitScore=${p.fitScore}` : null]
      .filter(Boolean)
      .join(", ");
    console.log(`${p.name}: ${from || "(empty)"} → Tier ${resolved ?? "—"}`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated} / ${partners.length} partners.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
