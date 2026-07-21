import { db } from "../db";
import { leadViewWhere } from "../leads";
import {
  normalizeConfig,
  type LeadReviewConfig,
  type LeadReviewSource,
} from "./types";

export type AgendaCandidate = {
  source: LeadReviewSource;
  channelId?: string;
  leadId?: string;
  displayName: string;
  salesman: string | null;
  rank: string | null;
  status: string | null;
  sortKey: Date | null;
  meta: string;
};

export async function listLeadReviewSalesmen(): Promise<string[]> {
  const [channelSales, channelOld, leadSales] = await Promise.all([
    db.crmChannel.findMany({
      where: { salesman: { not: null } },
      distinct: ["salesman"],
      select: { salesman: true },
    }),
    db.crmChannel.findMany({
      where: { staSalesOld: { not: null } },
      distinct: ["staSalesOld"],
      select: { staSalesOld: true },
    }),
    db.crmLead.findMany({
      where: { salesman: { not: null } },
      distinct: ["salesman"],
      select: { salesman: true },
    }),
  ]);
  const set = new Set<string>();
  for (const r of channelSales) if (r.salesman?.trim()) set.add(r.salesman.trim());
  for (const r of channelOld) if (r.staSalesOld?.trim()) set.add(r.staSalesOld.trim());
  for (const r of leadSales) if (r.salesman?.trim()) set.add(r.salesman.trim());
  return [...set].sort((a, b) => a.localeCompare(b));
}

async function confirmedChannelIds() {
  const rows = await db.leadReviewItem.findMany({
    where: { status: "CONFIRMED", channelId: { not: null } },
    select: { channelId: true },
  });
  return new Set(rows.map((r) => r.channelId!).filter(Boolean));
}

async function confirmedLeadIds() {
  const rows = await db.leadReviewItem.findMany({
    where: { status: "CONFIRMED", leadId: { not: null } },
    select: { leadId: true },
  });
  return new Set(rows.map((r) => r.leadId!).filter(Boolean));
}

function salesmanFilter(names: string[], all: boolean) {
  if (all || !names.length) return null;
  return names;
}

export async function buildLeadReviewAgenda(
  rawConfig: Partial<LeadReviewConfig>,
): Promise<{ config: LeadReviewConfig; items: AgendaCandidate[] }> {
  const config = normalizeConfig(rawConfig);
  if (config.channelCount <= 0 && config.nurtureCount <= 0) {
    return { config, items: [] };
  }

  const names = salesmanFilter(config.salesmanNames, config.allSalesmen);
  const [skipChannels, skipLeads] = await Promise.all([
    config.channelCount > 0 ? confirmedChannelIds() : Promise.resolve(new Set<string>()),
    config.nurtureCount > 0 ? confirmedLeadIds() : Promise.resolve(new Set<string>()),
  ]);

  const items: AgendaCandidate[] = [];

  if (config.channelCount > 0) {
    const typeWhere = config.includeChannelCustomer
      ? {}
      : { OR: [{ typeDetail: "线索" }, { typeDetail: null }, { typeDetail: "" }] };

    const salesmanWhere = names
      ? {
          OR: [{ salesman: { in: names } }, { staSalesOld: { in: names } }],
        }
      : {};

    const rows = await db.crmChannel.findMany({
      where: { AND: [typeWhere, salesmanWhere] },
      orderBy: [{ staRecdate: "desc" }, { syncedAt: "desc" }],
      take: Math.min(config.channelCount + skipChannels.size + 50, 500),
    });

    let n = 0;
    for (const r of rows) {
      if (skipChannels.has(r.id)) continue;
      items.push({
        source: "CHANNEL",
        channelId: r.id,
        displayName: r.name?.trim() || r.id,
        salesman: r.salesman ?? r.staSalesOld,
        rank: r.rank,
        status: r.status,
        sortKey: r.staRecdate,
        meta: [
          "Channel",
          r.staRecdate ? r.staRecdate.toISOString().slice(0, 10) : null,
          r.staSalesOld ? `前:${r.staSalesOld}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      n += 1;
      if (n >= config.channelCount) break;
    }
  }

  if (config.nurtureCount > 0) {
    const salesmanWhere = names ? { salesman: { in: names } } : {};
    const rows = await db.crmLead.findMany({
      where: { AND: [leadViewWhere("nurture"), salesmanWhere] },
      orderBy: [{ recdate: "desc" }, { syncedAt: "desc" }],
      take: Math.min(config.nurtureCount + skipLeads.size + 50, 500),
    });

    let n = 0;
    for (const r of rows) {
      if (skipLeads.has(r.id)) continue;
      items.push({
        source: "NURTURE",
        leadId: r.id,
        displayName: r.name?.trim() || r.id,
        salesman: r.salesman,
        rank: r.rank,
        status: r.status,
        sortKey: r.recdate,
        meta: [
          "培育",
          r.recdate ? r.recdate.toISOString().slice(0, 10) : null,
          r.status,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      n += 1;
      if (n >= config.nurtureCount) break;
    }
  }

  return { config, items };
}
