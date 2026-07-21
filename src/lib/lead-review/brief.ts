import { db } from "../db";
import type { LeadReviewSource } from "./types";

export type LeadPrepBrief = {
  source: LeadReviewSource;
  name: string;
  salesman: string | null;
  staSalesOld?: string | null;
  rank: string | null;
  status: string | null;
  region: string | null;
  sourceLabel: string | null;
  phone: string | null;
  contName: string | null;
  contEmail: string | null;
  dateLabel: string;
  dateValue: string | null;
  topics: string[];
};

function fmt(d: Date | null | undefined) {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
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
    return {
      source: "CHANNEL",
      name,
      salesman: r?.salesman ?? null,
      staSalesOld: r?.staSalesOld ?? null,
      rank: r?.rank ?? null,
      status: r?.status ?? null,
      region: [r?.countryCn, r?.city].filter(Boolean).join(" · ") || null,
      sourceLabel: r?.source ?? r?.sourceDetail ?? null,
      phone: r?.phone ?? null,
      contName: r?.contName ?? null,
      contEmail: r?.contEmail ?? null,
      dateLabel: "转出时间",
      dateValue: fmt(r?.staRecdate),
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
      salesman: r?.salesman ?? null,
      rank: r?.rank ?? null,
      status: r?.status ?? null,
      region: [r?.countryCn, r?.city].filter(Boolean).join(" · ") || null,
      sourceLabel: r?.source ?? r?.sourceDetail ?? null,
      phone: r?.phone ?? null,
      contName: r?.contName ?? null,
      contEmail: r?.contEmail ?? null,
      dateLabel: "KPI 开始",
      dateValue: fmt(r?.recdate),
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
    salesman: null,
    rank: null,
    status: null,
    region: null,
    sourceLabel: null,
    phone: null,
    contName: null,
    contEmail: null,
    dateLabel: "日期",
    dateValue: null,
    topics: ["请补充讨论要点"],
  };
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
