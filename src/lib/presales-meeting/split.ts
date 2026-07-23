import "server-only";

import { db } from "../db";
import { chatJson } from "../ai";
import { parseItemSectionsFromLiveNotes, type TranscriptSegment } from "./markers";
import { matchMinutesToItems, toMatchAgendaItem } from "./minutes-match";
import { itemDisplayLabel } from "./types";
import type { SplitProposal, SplitProposalItem } from "./split-types";

export type { SplitProposal, SplitProposalItem } from "./split-types";

async function summarizeSegment(opts: {
  label: string;
  customerName: string;
  projectName: string;
  segmentText: string;
  userId?: string;
}): Promise<{
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  projectWorkLogContent: string;
  todos: { title: string; detail?: string; dueDate?: string | null }[];
}> {
  if (!opts.segmentText.trim()) {
    return {
      coreNotes: "",
      businessRecordTitle: `${opts.customerName} · ${opts.projectName} 售前项目讨论`,
      businessRecordContent: "",
      projectWorkLogContent: "",
      todos: [],
    };
  }

  const raw = opts.segmentText.trim().slice(0, 12000);
  try {
    const ai = await chatJson<{
      progressSummary?: string;
      projectWorkLog?: string;
      todos?: { title?: string; detail?: string; dueDate?: string | null }[];
    }>(
      `你是售前项目助理。售前项目会议已按「同事+客户+项目」归属纪要。请提炼：
1. progressSummary：本次讨论结论与客户侧进展（150-350字，适合写入客户商务记录；只写片段中有的内容）
2. projectWorkLog：适合写入项目工作记录的实施/推进要点（可与 progressSummary 相近或更偏交付）
3. todos：明确后续待办数组 {title, detail?, dueDate?}，dueDate 用 YYYY-MM-DD 或 null

只输出 JSON：{ progressSummary, projectWorkLog, todos }`,
      `议程：${opts.label}\n客户：${opts.customerName}\n项目：${opts.projectName}\n\n讨论片段：\n${raw}`,
      {
        feature: "presales_project_meeting_split",
        userId: opts.userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.2,
      },
    );

    const progressSummary = String(ai.progressSummary ?? "").trim();
    const projectWorkLog = String(ai.projectWorkLog ?? progressSummary).trim();
    return {
      coreNotes: progressSummary,
      businessRecordTitle: `${opts.customerName} · ${opts.projectName} 售前项目讨论`,
      businessRecordContent: progressSummary || raw.slice(0, 2000),
      projectWorkLogContent: projectWorkLog || progressSummary || raw.slice(0, 2000),
      todos: (ai.todos ?? [])
        .map((t) => ({
          title: String(t.title ?? "").trim(),
          detail: t.detail ? String(t.detail).trim() : undefined,
          dueDate: t.dueDate ? String(t.dueDate).trim() : null,
        }))
        .filter((t) => t.title),
    };
  } catch {
    return {
      coreNotes: raw.slice(0, 400),
      businessRecordTitle: `${opts.customerName} · ${opts.projectName} 售前项目讨论`,
      businessRecordContent: raw.slice(0, 2000),
      projectWorkLogContent: raw.slice(0, 2000),
      todos: [],
    };
  }
}

function mergeSegments(segments: TranscriptSegment[], itemId: string): string {
  return segments
    .filter((s) => s.partnerId === itemId)
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");
}

export async function buildSplitProposal(meetingId: string, userId?: string): Promise<SplitProposal> {
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          user: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!meeting) throw new Error("会议不存在");

  const agenda = meeting.items.map((it) => ({
    itemId: it.id,
    label: itemDisplayLabel({
      userName: it.user.name,
      customerName: it.customer.name,
      projectName: it.project.name,
    }),
  }));

  const fromNotes = meeting.liveNotes?.trim()
    ? parseItemSectionsFromLiveNotes(meeting.liveNotes, agenda).filter(
        (s) => s.partnerId || s.text.trim(),
      )
    : [];

  const noteSegments = fromNotes.length
    ? fromNotes
    : (
        await matchMinutesToItems({
          transcriptText: meeting.transcriptText,
          transcriptJson: meeting.transcriptJson,
          startedAt: meeting.startedAt,
          recordingStartedAt: meeting.recordingStartedAt,
          endedAt: meeting.endedAt,
          items: meeting.items.map(toMatchAgendaItem),
        })
      ).segments;

  const unassignedText = noteSegments
    .filter((s) => !s.partnerId)
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");

  const agendaItems = meeting.items;
  const concurrency = 4;
  const items: SplitProposalItem[] = new Array(agendaItems.length);
  let cursor = 0;
  async function worker() {
    while (cursor < agendaItems.length) {
      const i = cursor++;
      const item = agendaItems[i]!;
      const label = agenda[i]!.label;
      const segmentText = mergeSegments(noteSegments, item.id);
      const summary = await summarizeSegment({
        label,
        customerName: item.customer.name,
        projectName: item.project.name,
        segmentText,
        userId,
      });
      items[i] = {
        itemId: item.id,
        label,
        userId: item.userId,
        customerId: item.customerId,
        projectId: item.projectId,
        segmentText,
        ...summary,
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, agendaItems.length || 1) }, () => worker()),
  );

  return { meetingId, items, unassignedText };
}

export async function persistSplitDrafts(proposal: SplitProposal) {
  for (const row of proposal.items) {
    await db.presalesProjectMeetingTodoDraft.deleteMany({
      where: { itemId: row.itemId, confirmed: false },
    });
    await db.presalesProjectMeetingItem.update({
      where: { id: row.itemId },
      data: { coreNotes: row.coreNotes || null },
    });
    if (row.todos.length) {
      await db.presalesProjectMeetingTodoDraft.createMany({
        data: row.todos.map((t, i) => ({
          itemId: row.itemId,
          title: t.title,
          detail: t.detail ?? null,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          sortOrder: i,
          confirmed: false,
        })),
      });
    }
  }

  await db.presalesProjectMeeting.update({
    where: { id: proposal.meetingId },
    data: { status: "PROCESSING" },
  });
}
