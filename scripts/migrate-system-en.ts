/**
 * One-time / idempotent migration: sync builtin taxonomy labels and system Agent template names to English.
 * Safe to run on every container start.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Inline label maps to avoid circular imports via taxonomy.ts */
const BUILTIN: Record<string, Record<string, string>> = {
  ARCHETYPE: {
    DATA_NATIVE: "Data-native",
    BI_MIGRATOR: "Competitor migration",
    IT_INTEGRATOR: "General IT integrator",
    IOT_INTEGRATOR: "IoT / Smart city",
    SALES_AGENT: "Channel-only agent",
    SHELL_DATA: "Shell data company",
    OTHER: "To be validated",
  },
  INDUSTRY: {
    BANKING: "Banking & Finance",
    GOVERNMENT: "Government & Public",
    OIL_GAS: "Oil & Gas / Energy",
    RETAIL: "Retail & FMCG",
    MANUFACTURING: "Manufacturing",
    HEALTHCARE: "Healthcare",
    TELECOM: "Telecom",
    REAL_ESTATE: "Real Estate",
    LOGISTICS: "Logistics & Supply Chain",
    HOSPITALITY: "Hospitality & Travel",
    EDUCATION: "Education",
    MEDIA: "Media & Advertising",
    CROSS: "Cross-industry",
    OTHER: "Other / TBD",
  },
  VALUE_PATTERN: {
    IOT_DASH: "IoT + Visualization",
    APP_REPORT: "Business apps + Complex reporting",
    CLOUD_APP: "Cloud channel + On-prem apps",
    DATA_BI: "Data governance + BI loop",
    BI_COMPLEMENT: "Competitor complement / Dual stack",
    OEM_EMBED: "OEM / Embedded",
    GOV_BID: "Government joint bidding",
  },
  CATEGORY: {
    PURE_DATA: "Pure Data Consulting",
    POWER_BI: "Power BI Partner",
    TABLEAU: "Tableau Partner",
    QLIK: "Qlik Partner",
    IT_INTEGRATOR: "IT Integrator",
    OTHER: "Other",
  },
};

/** Old Chinese template name → English fields */
const AGENT_MIGRATIONS: {
  from: string;
  name: string;
  description: string;
}[] = [
  {
    from: "舆情监控",
    name: "Sentiment Monitor",
    description:
      "Scan subscribed dimensions on a schedule (news, people, hiring, deals, competitors, risk, etc.) and store results.",
  },
  {
    from: "停滞伙伴唤醒",
    name: "Stale Partner Revival",
    description:
      "Daily scan for active partners with no activity in 30+ days; suggest re-engagement and create high-priority todos.",
  },
  {
    from: "候选伙伴发现",
    name: "Prospect Discovery",
    description: "Manual run: search for new potential partner companies and output a research brief for the pool.",
  },
  {
    from: "会前简报",
    name: "Pre-meeting Brief",
    description: "Manual (partner-bound): compile profile + latest external updates into a one-page pre-meeting brief.",
  },
  {
    from: "联合解决方案报告",
    name: "Joint Solution Report",
    description:
      "Manual (partner-bound): generate an editable joint solution Markdown report from profile and knowledge base.",
  },
  {
    from: "领英/外部动态监测",
    name: "LinkedIn / External Monitor (deprecated)",
    description: "Replaced by Sentiment Monitor.",
  },
  {
    from: "竞品信号雷达",
    name: "Competitor Signal Radar (deprecated)",
    description: "Replaced by Sentiment Monitor.",
  },
];

async function syncTaxonomyLabels() {
  const count = await db.taxonomyOption.count();
  if (count === 0) {
    const rows: { dimension: string; code: string; label: string; sortOrder: number; isBuiltin: boolean }[] = [];
    for (const [dimension, map] of Object.entries(BUILTIN)) {
      Object.entries(map).forEach(([code, label], i) => {
        rows.push({ dimension, code, label, sortOrder: i, isBuiltin: true });
      });
    }
    if (rows.length) await db.taxonomyOption.createMany({ data: rows });
    console.log("[migrate-en] Seeded TaxonomyOption with English labels");
    return;
  }

  let updated = 0;
  for (const [dimension, map] of Object.entries(BUILTIN)) {
    for (const [code, label] of Object.entries(map)) {
      const r = await db.taxonomyOption.updateMany({
        where: { dimension, code, isBuiltin: true },
        data: { label },
      });
      updated += r.count;
    }
  }
  console.log(`[migrate-en] Synced ${updated} builtin taxonomy labels to English`);
}

async function migrateAgentTemplates() {
  for (const m of AGENT_MIGRATIONS) {
    const r = await db.agent.updateMany({
      where: { isTemplate: true, name: m.from },
      data: { name: m.name, description: m.description },
    });
    if (r.count > 0) console.log(`[migrate-en] Agent template: ${m.from} → ${m.name}`);
  }
}

async function main() {
  await syncTaxonomyLabels();
  await migrateAgentTemplates();
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
