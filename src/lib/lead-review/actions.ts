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

  const { getLocale } = await import("../i18n/locale-server");
  const locale = await getLocale();
  const dateStr = new Date().toLocaleDateString(locale === "en" ? "en-CA" : "zh-CN");
  const title =
    input.title?.trim() ||
    (locale === "en"
      ? `Lead review ${dateStr} (C${config.channelCount}+N${config.nurtureCount})`
      : `过线索会议 ${dateStr}（C${config.channelCount}+N${config.nurtureCount}）`);

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
  const { markLeadDiscussed } = await import("./discuss-item");
  const result = await markLeadDiscussed(meetingId, itemId);
  if ("error" in result) return { error: result.error };
  revalidateMeeting(meetingId);
  const { ok: _ok, ...rest } = result;
  return { ok: true as const, ...rest };
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
        markerInsertedAt: null,
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
        recordingPath: null,
        recordingMimeType: null,
        recordingBytes: null,
        recordingStartedAt: null,
        recordingEndedAt: null,
        transcriptStatus: null,
        transcriptError: null,
        transcriptText: null,
        transcriptJson: null,
        xfyunTranscriptText: null,
        xfyunTranscriptJson: null,
        xfyunLiveNotes: null,
        tencentTranscriptText: null,
        tencentTranscriptJson: null,
        tencentLiveNotes: null,
        matchSource: null,
      },
    }),
  ]);

  revalidateMeeting(meetingId);
  return { ok: true as const };
}

/** 路径 A：保存腾讯/粘贴纪要并匹配归属 */
export async function matchLeadReviewMinutesAction(meetingId: string, transcriptText: string) {
  const user = await requireUser();
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { startedAt: true, recordingStartedAt: true },
  });
  if (!meeting) return { error: "会议不存在" };

  const { parseTranscriptTextToTimedDoc, serializeTimedTranscriptDoc } = await import(
    "../partner-review/transcript"
  );
  const { materializeLeadReviewLiveNotesFromMatch } = await import("./minutes-match");

  const anchor = meeting.startedAt ?? meeting.recordingStartedAt ?? null;
  const timed = parseTranscriptTextToTimedDoc(transcriptText, {
    recordingStartedAt: anchor,
  });
  const json = timed ? serializeTimedTranscriptDoc(timed) : null;
  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText,
      transcriptJson: json,
      tencentTranscriptText: transcriptText,
      tencentTranscriptJson: json,
      matchSource: "tencent",
      transcriptStatus: transcriptText.trim() ? "ready" : "idle",
      status: "PROCESSING",
    },
  });

  const { liveNotes, matchMethod } = await materializeLeadReviewLiveNotesFromMatch(
    meetingId,
    user.id,
  );
  if (liveNotes) {
    await db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: { tencentLiveNotes: liveNotes },
    });
  }
  revalidateMeeting(meetingId);
  return { ok: true as const, liveNotes, matchMethod, matchSource: "tencent" as const };
}

/** 路径 B：用已就绪的讯飞转写重新匹配 */
export async function matchLeadReviewXfyunAction(meetingId: string) {
  const user = await requireUser();
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    select: {
      xfyunTranscriptText: true,
      xfyunTranscriptJson: true,
      transcriptText: true,
      transcriptJson: true,
    },
  });
  if (!meeting) return { error: "会议不存在" };
  const text = meeting.xfyunTranscriptText?.trim() || meeting.transcriptText?.trim();
  const json = meeting.xfyunTranscriptJson || meeting.transcriptJson;
  if (!text) return { error: "尚无讯飞转写，请先完成会中录音并转写" };

  const { materializeLeadReviewLiveNotesFromMatch } = await import("./minutes-match");

  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText: text,
      transcriptJson: json,
      matchSource: "xfyun",
      transcriptStatus: "ready",
      status: "PROCESSING",
    },
  });

  const { liveNotes, matchMethod } = await materializeLeadReviewLiveNotesFromMatch(
    meetingId,
    user.id,
  );
  if (liveNotes) {
    await db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: { xfyunLiveNotes: liveNotes },
    });
  }
  revalidateMeeting(meetingId);
  return { ok: true as const, liveNotes, matchMethod, matchSource: "xfyun" as const };
}

export async function switchLeadReviewMatchSourceAction(
  meetingId: string,
  source: "tencent" | "xfyun",
) {
  await requireUser();
  const meeting = await db.leadReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };

  if (source === "tencent") {
    if (!meeting.tencentTranscriptText?.trim() && !meeting.tencentLiveNotes?.trim()) {
      return { error: "尚无腾讯纪要匹配结果" };
    }
    await db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: {
        matchSource: "tencent",
        transcriptText: meeting.tencentTranscriptText ?? meeting.transcriptText,
        transcriptJson: meeting.tencentTranscriptJson ?? meeting.transcriptJson,
        liveNotes: meeting.tencentLiveNotes ?? meeting.liveNotes,
      },
    });
  } else {
    if (!meeting.xfyunTranscriptText?.trim() && !meeting.xfyunLiveNotes?.trim()) {
      return { error: "尚无讯飞转写匹配结果" };
    }
    await db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: {
        matchSource: "xfyun",
        transcriptText: meeting.xfyunTranscriptText ?? meeting.transcriptText,
        transcriptJson: meeting.xfyunTranscriptJson ?? meeting.transcriptJson,
        liveNotes: meeting.xfyunLiveNotes ?? meeting.liveNotes,
      },
    });
  }
  revalidateMeeting(meetingId);
  return { ok: true as const, matchSource: source };
}

/** 保存人工校对后的归属，并写入各线索 coreNotes */
export async function saveLeadReviewAssignmentAction(
  meetingId: string,
  input: {
    drafts: Record<string, string>;
    unassigned?: string;
    applyToCoreNotes?: boolean;
  },
) {
  await requireUser();
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!meeting) return { error: "会议不存在" };

  const { buildLeadLiveNotesFromSegments } = await import("./markers");
  const segments = [
    ...(input.unassigned?.trim()
      ? [{ itemId: null as string | null, displayName: null as string | null, text: input.unassigned.trim() }]
      : []),
    ...meeting.items.map((it) => ({
      itemId: it.id as string | null,
      displayName: (it.displayName?.trim() || it.id.slice(0, 8)) as string | null,
      text: (input.drafts[it.id] ?? "").trim(),
    })),
  ];
  const liveNotes = buildLeadLiveNotesFromSegments(segments);
  const matchSource = meeting.matchSource === "xfyun" ? "xfyun" : "tencent";

  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: {
      liveNotes,
      status: "PROCESSING",
      ...(matchSource === "xfyun"
        ? { xfyunLiveNotes: liveNotes }
        : { tencentLiveNotes: liveNotes }),
    },
  });

  if (input.applyToCoreNotes !== false) {
    await Promise.all(
      meeting.items.map((it) => {
        const text = (input.drafts[it.id] ?? "").trim();
        if (!text) return Promise.resolve();
        return db.leadReviewItem.update({
          where: { id: it.id },
          data: {
            coreNotes: it.coreNotes?.trim() ? it.coreNotes : text,
            status: it.status === "CONFIRMED" ? "CONFIRMED" : "DISCUSSED",
          },
        });
      }),
    );
  }

  revalidateMeeting(meetingId);
  return { ok: true as const, liveNotes };
}
