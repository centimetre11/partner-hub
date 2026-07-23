export type MeetingStatus = "DRAFT" | "PREP" | "LIVE" | "PROCESSING" | "DONE";
export type MeetingPhase = "prep" | "live" | "post" | "done";
export type MeetingPostStep = "paste" | "assign" | "extract" | "report";
export type MeetingWorkStage = "idle" | "saving" | "matching" | "extracting" | "done";
export type MeetingMatchSource = "tencent" | "xfyun" | string | null;

export type MeetingAgendaItemBase = {
  id: string;
  title: string;
  /** PENDING | DISCUSSED | CONFIRMED */
  status: string;
  discussedAt?: string | null;
  markerInsertedAt?: string | null;
};

export function meetingPhaseFromStatus(status: string): MeetingPhase {
  if (status === "DONE") return "done";
  if (status === "PROCESSING") return "post";
  if (status === "LIVE") return "live";
  return "prep";
}

export function orderAgendaByDiscussTime<T extends MeetingAgendaItemBase>(items: T[]): T[] {
  const discussed = items
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = Date.parse(a.markerInsertedAt ?? a.discussedAt ?? "") || 0;
      const tb = Date.parse(b.markerInsertedAt ?? b.discussedAt ?? "") || 0;
      return ta - tb;
    });
  if (discussed.length) {
    const rest = items.filter((it) => !discussed.some((d) => d.id === it.id));
    return [...discussed, ...rest];
  }
  return items;
}
