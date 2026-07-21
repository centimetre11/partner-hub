import { db } from "../db";
import type { LeadReviewSource } from "./types";

export type LeadPrepBrief = {
  source: LeadReviewSource;
  name: string;
  companyId: string | null;
  clueId: string | null;
  salesman: string | null;
  staSalesOld?: string | null;
  rank: string | null;
  status: string | null;
  typeDetail: string | null;
  region: string | null;
  province: string | null;
  zone: string | null;
  sourceLabel: string | null;
  sourceDetail: string | null;
  phone: string | null;
  contName: string | null;
  contEmail: string | null;
  contDuty: string | null;
  overseaAgent: string | null;
  dateLabel: string;
  dateValue: string | null;
  jzDate: string | null;
  /** 商务记录1 */
  traceDetail: string | null;
  /** 商务记录2 */
  detail: string | null;
  topics: string[];
};

function fmt(d: Date | null | undefined) {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export function formatCrmMultiline(raw?: string | null) {
  if (!raw?.trim()) return null;
  return raw.replace(/<BR\s*\/?>/gi, "\n").replace(/\\n/g, "\n").trim();
}

async function resolveBusinessRecords(opts: {
  channelId?: string | null;
  leadId?: string | null;
  companyId?: string | null;
  channelDetail?: string | null;
  channelTrace?: string | null;
}) {
  let detail = formatCrmMultiline(opts.channelDetail);
  let traceDetail = formatCrmMultiline(opts.channelTrace);

  if (detail && traceDetail) return { detail, traceDetail };

  const leadIds = [opts.leadId, opts.channelId].filter(Boolean) as string[];
  for (const id of leadIds) {
    const lead = await db.crmLead.findUnique({
      where: { id },
      select: { detail: true, traceDetail: true },
    });
    if (!lead) continue;
    if (!detail) detail = formatCrmMultiline(lead.detail);
    if (!traceDetail) traceDetail = formatCrmMultiline(lead.traceDetail);
    if (detail && traceDetail) break;
  }

  if ((!detail || !traceDetail) && opts.companyId) {
    const lead = await db.crmLead.findFirst({
      where: { companyId: opts.companyId },
      orderBy: { syncedAt: "desc" },
      select: { detail: true, traceDetail: true },
    });
    if (lead) {
      if (!detail) detail = formatCrmMultiline(lead.detail);
      if (!traceDetail) traceDetail = formatCrmMultiline(lead.traceDetail);
    }
  }

  return { detail, traceDetail };
}

export async function buildItemPrepBrief(opts: {
  source: LeadReviewSource;
  channelId?: string | null;
  leadId?: string | null;
  displayName?: string | null;
}): Promise<LeadPrepBrief> {
  if (opts.source === "CHANNEL" && opts.channelId) {
    const r = await db.crmChannel.findUnique({ where: { id: opts.channelId } });
    const name = r?.name?.trim() || opts.displayName || opts.channelId;
    const { detail, traceDetail } = await resolveBusinessRecords({
      channelId: opts.channelId,
      companyId: r?.companyId,
      channelDetail: r?.detail,
      channelTrace: r?.traceDetail,
    });
    return {
      source: "CHANNEL",
      name,
      companyId: r?.companyId ?? null,
      clueId: opts.channelId.startsWith("com:") ? null : opts.channelId,
      salesman: r?.salesman ?? null,
      staSalesOld: r?.staSalesOld ?? null,
      rank: r?.rank ?? null,
      status: r?.status ?? null,
      typeDetail: r?.typeDetail ?? null,
      region: [r?.countryCn, r?.city].filter(Boolean).join(" · ") || null,
      province: r?.province ?? null,
      zone: r?.zone ?? null,
      sourceLabel: r?.source ?? null,
      sourceDetail: r?.sourceDetail ?? null,
      phone: r?.phone ?? null,
      contName: r?.contName ?? null,
      contEmail: r?.contEmail ?? null,
      contDuty: r?.contDuty ?? null,
      overseaAgent: r?.overseaAgent ?? null,
      dateLabel: "转出时间",
      dateValue: fmt(r?.staRecdate),
      jzDate: null,
      detail,
      traceDetail,
      topics: [
        "转 channel 的主因更像质量问题还是消化/产能问题？",
        "来源与等级是否匹配预期？",
        "转出前销售跟进是否充分？",
      ],
    };
  }

  if (opts.source === "NURTURE" && opts.leadId) {
    const r = await db.crmLead.findUnique({ where: { id: opts.leadId } });
    const name = r?.name?.trim() || opts.displayName || opts.leadId;
    return {
      source: "NURTURE",
      name,
      companyId: r?.companyId ?? null,
      clueId: opts.leadId.startsWith("com:") ? null : opts.leadId,
      salesman: r?.salesman ?? null,
      rank: r?.rank ?? null,
      status: r?.status ?? null,
      typeDetail: r?.typeDetail ?? null,
      region: [r?.countryCn, r?.city].filter(Boolean).join(" · ") || null,
      province: r?.province ?? null,
      zone: r?.zone ?? null,
      sourceLabel: r?.source ?? null,
      sourceDetail: r?.sourceDetail ?? null,
      phone: r?.phone ?? null,
      contName: r?.contName ?? null,
      contEmail: r?.contEmail ?? null,
      contDuty: r?.contDuty ?? null,
      overseaAgent: r?.overseaAgent ?? null,
      dateLabel: "KPI 开始",
      dateValue: fmt(r?.recdate),
      jzDate: fmt(r?.jzDate),
      detail: formatCrmMultiline(r?.detail),
      traceDetail: formatCrmMultiline(r?.traceDetail),
      topics: [
        "培育进展是否健康？卡点在质量还是跟进节奏？",
        "下一步应继续培育、转客户，还是该出库？",
        "责任销售产能是否跟得上？",
      ],
    };
  }

  return {
    source: opts.source,
    name: opts.displayName || "未知",
    companyId: null,
    clueId: null,
    salesman: null,
    rank: null,
    status: null,
    typeDetail: null,
    region: null,
    province: null,
    zone: null,
    sourceLabel: null,
    sourceDetail: null,
    phone: null,
    contName: null,
    contEmail: null,
    contDuty: null,
    overseaAgent: null,
    dateLabel: "日期",
    dateValue: null,
    jzDate: null,
    detail: null,
    traceDetail: null,
    topics: ["请补充讨论要点"],
  };
}

export async function loadMeetingItemFacts(
  items: {
    id: string;
    source: string;
    channelId: string | null;
    leadId: string | null;
    displayName: string | null;
    prepBrief: string | null;
  }[],
) {
  const map: Record<string, LeadPrepBrief> = {};
  await Promise.all(
    items.map(async (item) => {
      const live = await buildItemPrepBrief({
        source: item.source as LeadReviewSource,
        channelId: item.channelId,
        leadId: item.leadId,
        displayName: item.displayName,
      });
      if (item.prepBrief) {
        try {
          const parsed = JSON.parse(item.prepBrief) as LeadPrepBrief;
          if (Array.isArray(parsed.topics) && parsed.topics.length) {
            live.topics = parsed.topics;
          }
        } catch {
          /* ignore */
        }
      }
      map[item.id] = live;
    }),
  );
  return map;
}

export async function generateMeetingPrepBriefs(meetingId: string) {
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!meeting) throw new Error("会议不存在");

  for (const item of meeting.items) {
    const brief = await buildItemPrepBrief({
      source: item.source as LeadReviewSource,
      channelId: item.channelId,
      leadId: item.leadId,
      displayName: item.displayName,
    });
    await db.leadReviewItem.update({
      where: { id: item.id },
      data: { prepBrief: JSON.stringify(brief) },
    });
  }

  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: {
      status: meeting.status === "DRAFT" ? "PREP" : meeting.status,
      prepGeneratedAt: new Date(),
    },
  });
}
