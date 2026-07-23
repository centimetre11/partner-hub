import { parseConfirmedSnapshot, itemDisplayLabel, type ConfirmedItemSnapshot, type PrepFacts } from "./types";

export type MeetingItemClient = {
  id: string;
  userId: string;
  userName: string;
  customerId: string;
  customerName: string;
  projectId: string;
  projectName: string;
  projectPhase: string | null;
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

export function toMeetingItemClient(it: {
  id: string;
  userId: string;
  customerId: string;
  projectId: string;
  sortOrder: number;
  status: string;
  discussedAt: Date | null;
  markerInsertedAt: Date | null;
  coreNotes: string | null;
  confirmedSnapshot: string | null;
  user: { name: string };
  customer: { name: string };
  project: { name: string; phase?: string | null };
  todoDrafts: {
    id: string;
    title: string;
    detail: string | null;
    dueDate: Date | null;
    confirmed: boolean;
  }[];
}): MeetingItemClient {
  const label = itemDisplayLabel({
    userName: it.user.name,
    customerName: it.customer.name,
    projectName: it.project.name,
  });
  return {
    id: it.id,
    userId: it.userId,
    userName: it.user.name,
    customerId: it.customerId,
    customerName: it.customer.name,
    projectId: it.projectId,
    projectName: it.project.name,
    projectPhase: it.project.phase ?? null,
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
  items: Parameters<typeof toMeetingItemClient>[0][];
}): MeetingClient {
  let attendees: string[] = [];
  if (m.attendeeUserIds) {
    try {
      attendees = JSON.parse(m.attendeeUserIds) as string[];
    } catch {
      attendees = [];
    }
  }
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    scheduledAt: m.scheduledAt?.toISOString() ?? null,
    startedAt: m.startedAt?.toISOString() ?? null,
    endedAt: m.endedAt?.toISOString() ?? null,
    attendeeUserIds: attendees,
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
