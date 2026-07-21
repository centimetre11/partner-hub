"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { db } from "../db";
import { generateMeetingPrepBriefs } from "./brief";
import { applyLeadReviewConfirm, type ConfirmLeadItemPayload } from "./apply";
import { buildLeadReviewAgenda } from "./select";
import {
  LAST_CONFIG_KEY,
  normalizeConfig,
  parseLeadReviewConfig,
  type LeadReviewConfig,
} from "./types";

function revalidateMeeting(id: string) {
  revalidatePath("/lead-reviews");
  revalidatePath(`/lead-reviews/${id}`);
  revalidatePath("/ops");
}

function newPreviewToken() {
  return randomBytes(18).toString("hex");
}

export async function previewLeadReviewAgendaAction(config: Partial<LeadReviewConfig>) {
  await requireUser();
  return buildLeadReviewAgenda(config);
}

export async function getLeadReviewLastConfigAction(): Promise<LeadReviewConfig> {
  await requireUser();
  const row = await db.setting.findUnique({ where: { key: LAST_CONFIG_KEY } });
  return parseLeadReviewConfig(row?.value);
}

export async function createLeadReviewMeetingAction(input: {
  title?: string;
  scheduledAt?: string;
  config: Partial<LeadReviewConfig>;
}) {
  const user = await requireUser();
  const { config, items } = await buildLeadReviewAgenda(input.config);
  if (!items.length) {
    return { error: "按当前配置未抽到可过的线索，请调整销售范围或条数" };
  }

  const title =
    input.title?.trim() ||
    `过线索会议 ${new Date().toLocaleDateString("zh-CN")}（C${config.channelCount}+N${config.nurtureCount}）`;

  const meeting = await db.leadReviewMeeting.create({
    data: {
      title,
      status: "DRAFT",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdById: user.id,
      configJson: JSON.stringify(config),
      previewToken: newPreviewToken(),
      items: {
        create: items.map((it, sortOrder) => ({
          source: it.source,
          channelId: it.channelId ?? null,
          leadId: it.leadId ?? null,
          displayName: it.displayName,
          sortOrder,
        })),
      },
    },
  });

  await db.setting.upsert({
    where: { key: LAST_CONFIG_KEY },
    create: { key: LAST_CONFIG_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });

  revalidatePath("/lead-reviews");
  return { ok: true as const, id: meeting.id };
}

export async function deleteLeadReviewMeetingAction(meetingId: string) {
  await requireUser();
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  if (!meeting) return { error: "会议不存在" };
  if (meeting.status === "DONE") return { error: "已完成会议不可删除" };
  await db.leadReviewMeeting.delete({ where: { id: meetingId } });
  revalidatePath("/lead-reviews");
  return { ok: true as const };
}

export async function runLeadReviewPrepAction(meetingId: string) {
  await requireUser();
  try {
    await generateMeetingPrepBriefs(meetingId);
    revalidateMeeting(meetingId);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function startLeadReviewMeetingAction(meetingId: string) {
  await requireUser();
  const meeting = await db.leadReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };
  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: {
      status: "LIVE",
      startedAt: meeting.startedAt ?? new Date(),
    },
  });
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function endLeadReviewMeetingAction(meetingId: string) {
  await requireUser();
  try {
    await db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: { status: "PROCESSING", endedAt: new Date() },
    });
    revalidateMeeting(meetingId);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function discussLeadReviewItemAction(meetingId: string, itemId: string) {
  await requireUser();
  const item = await db.leadReviewItem.findFirst({
    where: { id: itemId, meetingId },
  });
  if (!item) return { error: "议程项不存在" };

  const now = new Date();
  const meeting = await db.leadReviewMeeting.findUnique({ where: { id: meetingId } });
  const markerLine = `[${now.toISOString().slice(11, 16)}] 开始过 ${item.displayName ?? item.id}`;
  const nextNotes = meeting?.liveNotes?.trim()
    ? `${meeting.liveNotes.trim()}\n${markerLine}`
    : markerLine;

  await db.$transaction([
    db.leadReviewItem.update({
      where: { id: itemId },
      data: {
        status: item.status === "CONFIRMED" ? item.status : "DISCUSSED",
        discussedAt: item.discussedAt ?? now,
      },
    }),
    db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: { liveNotes: nextNotes },
    }),
  ]);

  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function saveLeadReviewLiveNotesAction(meetingId: string, liveNotes: string) {
  await requireUser();
  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function saveLeadReviewItemNotesAction(
  meetingId: string,
  itemId: string,
  coreNotes: string,
) {
  await requireUser();
  await db.leadReviewItem.updateMany({
    where: { id: itemId, meetingId },
    data: { coreNotes },
  });
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function confirmLeadReviewItemsAction(
  meetingId: string,
  items: ConfirmLeadItemPayload[],
) {
  const user = await requireUser();
  try {
    const results = await applyLeadReviewConfirm({
      meetingId,
      userId: user.id,
      items,
    });
    revalidateMeeting(meetingId);
    return { ok: true as const, results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resetLeadReviewToPrepAction(meetingId: string) {
  await requireUser();
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  if (!meeting) return { error: "会议不存在" };
  if (meeting.status === "DONE") return { error: "已完成的历史会议不可重置" };
  if (meeting.status !== "PROCESSING" && meeting.status !== "LIVE") {
    return { error: "仅进行中或会后处理阶段可回到会前" };
  }

  await db.$transaction([
    db.leadReviewTodoDraft.deleteMany({ where: { item: { meetingId } } }),
    db.leadReviewItem.updateMany({
      where: { meetingId },
      data: {
        discussedAt: null,
        status: "PENDING",
        coreNotes: null,
        verdict: null,
        confirmedSnapshot: null,
      },
    }),
    db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: {
        status: "PREP",
        startedAt: null,
        endedAt: null,
        liveNotes: null,
      },
    }),
  ]);

  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export type { LeadReviewConfig };
export { normalizeConfig };
