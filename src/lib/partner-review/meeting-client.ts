import {
  parseConfirmedSnapshot,
  type ConfirmedItemSnapshot,
  type PartnerPrepBrief,
} from "./types";

export type ReviewItemClient = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerTier: string | null;
  sortOrder: number;
  status: string;
  discussedAt: string | null;
  markerInsertedAt: string | null;
  prepBrief: PartnerPrepBrief | null;
  coreNotes: string | null;
  confirmedSnapshot: ConfirmedItemSnapshot | null;
  todoDrafts: {
    id: string;
    title: string;
    detail: string | null;
    dueDate: string | null;
    confirmed: boolean;
  }[];
};

export type MeetingClient = {
  id: string;
  title: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  liveNotes: string | null;
  transcriptText: string | null;
  prepGeneratedAt: string | null;
  dingtalkRecordId: string | null;
  dingtalkConferenceId: string | null;
  dingtalkSpaceId: string | null;
  dingtalkFileId: string | null;
  recordingPath: string | null;
  recordingBytes: number | null;
  recordingStartedAt: string | null;
  recordingEndedAt: string | null;
  transcriptStatus: string | null;
  transcriptError: string | null;
  items: ReviewItemClient[];
};

function parseBrief(raw: string | null): PartnerPrepBrief | null {
  if (!raw) return null;
  try {
    const brief = JSON.parse(raw) as PartnerPrepBrief;
    if (!brief.todos?.length && brief.openTodos?.length) {
      brief.todos = brief.openTodos.map((t) => ({ ...t, done: false }));
    }
    if (brief.progress?.length) {
      brief.progress = brief.progress.map((p) => ({
        ...p,
        categoryLabel:
          p.categoryLabel ||
          ({
            VISIT: "拜访",
            TRAINING: "培训",
            NEGOTIATION: "谈判",
            DELIVERY: "交付",
            RELATIONSHIP: "关系",
            OTHER: "进展",
          } as Record<string, string>)[p.category] ||
          "进展",
      }));
    }
    if (!brief.customerOpportunities?.length && brief.opportunities?.length) {
      const map = new Map<string, PartnerPrepBrief["customerOpportunities"][number]>();
      for (const o of brief.opportunities) {
        const cid = o.customerId ?? "__unassigned__";
        const cname = o.customerName ?? "未关联客户";
        if (!map.has(cid)) map.set(cid, { customerId: cid, customerName: cname, opportunities: [] });
        map.get(cid)!.opportunities.push({
          id: o.id,
          name: o.name,
          stage: o.stage,
          amount: o.amount,
          status: o.status ?? "P20",
          statusLabel: o.statusLabel ?? o.status ?? "进行中",
        });
      }
      brief.customerOpportunities = [...map.values()];
    }
    brief.customerOpportunities = brief.customerOpportunities ?? [];
    return brief;
  } catch {
    return null;
  }
}

/** 服务端 / 客户端均可调用的会议序列化（勿放进 "use client" 模块） */
export function toMeetingClient(raw: {
  id: string;
  title: string;
  status: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  liveNotes: string | null;
  transcriptText: string | null;
  prepGeneratedAt: Date | null;
  dingtalkRecordId: string | null;
  dingtalkConferenceId: string | null;
  dingtalkSpaceId: string | null;
  dingtalkFileId: string | null;
  recordingPath?: string | null;
  recordingBytes?: number | null;
  recordingStartedAt?: Date | null;
  recordingEndedAt?: Date | null;
  transcriptStatus?: string | null;
  transcriptError?: string | null;
  items: Array<{
    id: string;
    partnerId: string;
    sortOrder: number;
    status: string;
    discussedAt: Date | null;
    markerInsertedAt?: Date | null;
    prepBrief: string | null;
    coreNotes: string | null;
    confirmedSnapshot?: string | null;
    partner: { id: string; name: string; tier: string | null };
    todoDrafts: Array<{
      id: string;
      title: string;
      detail: string | null;
      dueDate: Date | null;
      confirmed: boolean;
    }>;
  }>;
}): MeetingClient {
  return {
    id: raw.id,
    title: raw.title,
    status: raw.status,
    startedAt: raw.startedAt?.toISOString() ?? null,
    endedAt: raw.endedAt?.toISOString() ?? null,
    liveNotes: raw.liveNotes,
    transcriptText: raw.transcriptText,
    prepGeneratedAt: raw.prepGeneratedAt?.toISOString() ?? null,
    dingtalkRecordId: raw.dingtalkRecordId,
    dingtalkConferenceId: raw.dingtalkConferenceId,
    dingtalkSpaceId: raw.dingtalkSpaceId,
    dingtalkFileId: raw.dingtalkFileId,
    recordingPath: raw.recordingPath ?? null,
    recordingBytes: raw.recordingBytes ?? null,
    recordingStartedAt: raw.recordingStartedAt?.toISOString() ?? null,
    recordingEndedAt: raw.recordingEndedAt?.toISOString() ?? null,
    transcriptStatus: raw.transcriptStatus ?? null,
    transcriptError: raw.transcriptError ?? null,
    items: raw.items.map((it) => ({
      id: it.id,
      partnerId: it.partnerId,
      partnerName: it.partner.name,
      partnerTier: it.partner.tier,
      sortOrder: it.sortOrder,
      status: it.status,
      discussedAt: it.discussedAt?.toISOString() ?? null,
      markerInsertedAt: it.markerInsertedAt?.toISOString() ?? null,
      prepBrief: parseBrief(it.prepBrief),
      coreNotes: it.coreNotes,
      confirmedSnapshot: parseConfirmedSnapshot(it.confirmedSnapshot),
      todoDrafts: it.todoDrafts.map((t) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        dueDate: t.dueDate?.toISOString() ?? null,
        confirmed: t.confirmed,
      })),
    })),
  };
}
