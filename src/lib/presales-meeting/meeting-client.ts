import {
  parseConfirmedSnapshot,
  itemDisplayLabel,
  type ConfirmedItemSnapshot,
  type PrepFacts,
} from "./types";
import type { AgendaSubjectKind } from "./subject";

export type MeetingItemClient = {
  id: string;
  userId: string;
  userName: string;
  subjectKind: AgendaSubjectKind;
  subjectKey: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  projectPhase: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  label: string;
  sortOrder: number;
  status: string;
  discussedAt: string | null;
  markerInsertedAt: string | null;
  coreNotes: string | null;
  confirmedSnapshot: ConfirmedItemSnapshot | null;
  todoDrafts: {
    id: string;
    title: string;
    detail: string | null;
    dueDate: string | null;
    confirmed: boolean;
  }[];
  prepFacts?: PrepFacts | null;
};

export type MeetingClient = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  attendeeUserIds: string[];
  liveNotes: string | null;
  transcriptText: string | null;
  matchSource: string | null;
  tencentTranscriptText: string | null;
  tencentLiveNotes: string | null;
  xfyunTranscriptText: string | null;
  xfyunLiveNotes: string | null;
  recordingBytes: number | null;
  recordingStartedAt: string | null;
  transcriptStatus: string | null;
  transcriptError: string | null;
  prepGeneratedAt: string | null;
  items: MeetingItemClient[];
};

type ItemRow = {
  id: string;
  userId: string;
  subjectKind?: string | null;
  subjectKey?: string | null;
  customerId: string | null;
  projectId: string | null;
  opportunityId?: string | null;
  partnerId?: string | null;
  sortOrder: number;
  status: string;
  discussedAt: Date | null;
  markerInsertedAt: Date | null;
  coreNotes: string | null;
  confirmedSnapshot: string | null;
  user: { name: string };
  customer: { name: string } | null;
  project: { name: string; phase?: string | null } | null;
  opportunity?: { name: string } | null;
  partner?: { name: string } | null;
  todoDrafts: {
    id: string;
    title: string;
    detail: string | null;
    dueDate: Date | null;
    confirmed: boolean;
  }[];
};

function resolveKind(it: ItemRow): AgendaSubjectKind {
  if (
    it.subjectKind === "OPPORTUNITY" ||
    it.subjectKind === "PARTNER" ||
    it.subjectKind === "PROJECT" ||
    it.subjectKind === "CUSTOMER"
  ) {
    return it.subjectKind;
  }
  if (it.opportunityId && !it.projectId) return "OPPORTUNITY";
  if (it.partnerId && !it.projectId && !it.opportunityId && !it.customerId) return "PARTNER";
  if (it.customerId && !it.projectId && !it.opportunityId && !it.partnerId) return "CUSTOMER";
  return "PROJECT";
}

function resolveSubjectKey(it: ItemRow, kind: AgendaSubjectKind): string {
  if (it.subjectKey) return it.subjectKey;
  if (kind === "OPPORTUNITY" && it.opportunityId) return `opportunity:${it.opportunityId}`;
  if (kind === "PARTNER" && it.partnerId) return `partner:${it.partnerId}`;
  if (kind === "CUSTOMER" && it.customerId) return `customer:${it.customerId}`;
  if (it.projectId) return `project:${it.projectId}`;
  return it.id;
}

export function toMeetingItemClient(it: ItemRow): MeetingItemClient {
  const subjectKind = resolveKind(it);
  const subjectKey = resolveSubjectKey(it, subjectKind);
  const label = itemDisplayLabel({
    userName: it.user.name,
    subjectKind,
    customerName: it.customer?.name ?? null,
    projectName: it.project?.name ?? null,
    opportunityName: it.opportunity?.name ?? null,
    partnerName: it.partner?.name ?? null,
  });
  return {
    id: it.id,
    userId: it.userId,
    userName: it.user.name,
    subjectKind,
    subjectKey,
    customerId: it.customerId,
    customerName: it.customer?.name ?? null,
    projectId: it.projectId,
    projectName: it.project?.name ?? null,
    projectPhase: it.project?.phase ?? null,
    opportunityId: it.opportunityId ?? null,
    opportunityName: it.opportunity?.name ?? null,
    partnerId: it.partnerId ?? null,
    partnerName: it.partner?.name ?? null,
    label,
    sortOrder: it.sortOrder,
    status: it.status,
    discussedAt: it.discussedAt?.toISOString() ?? null,
    markerInsertedAt: it.markerInsertedAt?.toISOString() ?? null,
    coreNotes: it.coreNotes,
    confirmedSnapshot: parseConfirmedSnapshot(it.confirmedSnapshot),
    todoDrafts: it.todoDrafts.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail,
      dueDate: t.dueDate?.toISOString() ?? null,
      confirmed: t.confirmed,
    })),
  };
}

export function toMeetingClient(m: {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  attendeeUserIds: string | null;
  liveNotes: string | null;
  transcriptText: string | null;
  matchSource: string | null;
  tencentTranscriptText: string | null;
  tencentLiveNotes: string | null;
  xfyunTranscriptText: string | null;
  xfyunLiveNotes: string | null;
  recordingBytes: number | null;
  recordingStartedAt: Date | null;
  transcriptStatus: string | null;
  transcriptError: string | null;
  prepGeneratedAt: Date | null;
  items: ItemRow[];
}): MeetingClient {
  let attendeeUserIds: string[] = [];
  try {
    attendeeUserIds = m.attendeeUserIds ? (JSON.parse(m.attendeeUserIds) as string[]) : [];
  } catch {
    attendeeUserIds = [];
  }
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    scheduledAt: m.scheduledAt?.toISOString() ?? null,
    startedAt: m.startedAt?.toISOString() ?? null,
    endedAt: m.endedAt?.toISOString() ?? null,
    attendeeUserIds,
    liveNotes: m.liveNotes,
    transcriptText: m.transcriptText,
    matchSource: m.matchSource,
    tencentTranscriptText: m.tencentTranscriptText,
    tencentLiveNotes: m.tencentLiveNotes,
    xfyunTranscriptText: m.xfyunTranscriptText,
    xfyunLiveNotes: m.xfyunLiveNotes,
    recordingBytes: m.recordingBytes,
    recordingStartedAt: m.recordingStartedAt?.toISOString() ?? null,
    transcriptStatus: m.transcriptStatus,
    transcriptError: m.transcriptError,
    prepGeneratedAt: m.prepGeneratedAt?.toISOString() ?? null,
    items: m.items.map(toMeetingItemClient),
  };
}
