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
  liveNotes: string | null;
  transcriptText: string | null;
  prepGeneratedAt: string | null;
  dingtalkRecordId: string | null;
  dingtalkConferenceId: string | null;
  dingtalkSpaceId: string | null;
  dingtalkFileId: string | null;
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
  liveNotes: string | null;
  transcriptText: string | null;
  prepGeneratedAt: Date | null;
  dingtalkRecordId: string | null;
  dingtalkConferenceId: string | null;
  dingtalkSpaceId: string | null;
  dingtalkFileId: string | null;
  items: Array<{
    id: string;
    partnerId: string;
    sortOrder: number;
    status: string;
    discussedAt: Date | null;
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
    liveNotes: raw.liveNotes,
    transcriptText: raw.transcriptText,
    prepGeneratedAt: raw.prepGeneratedAt?.toISOString() ?? null,
    dingtalkRecordId: raw.dingtalkRecordId,
    dingtalkConferenceId: raw.dingtalkConferenceId,
    dingtalkSpaceId: raw.dingtalkSpaceId,
    dingtalkFileId: raw.dingtalkFileId,
    items: raw.items.map((it) => ({
      id: it.id,
      partnerId: it.partnerId,
      partnerName: it.partner.name,
      partnerTier: it.partner.tier,
      sortOrder: it.sortOrder,
      status: it.status,
      discussedAt: it.discussedAt?.toISOString() ?? null,
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
