import { getWecomAccessToken, resolveWecomOauthConfig } from "./wecom-oauth";
import { isValidWecomUserId, sanitizeWecomUserId } from "./wecom-identity-validation";

type WecomApiError = {
  errcode?: number;
  errmsg?: string;
};

type WecomScheduleAddResponse = WecomApiError & {
  schedule_id?: string;
};

export type CreateWecomScheduleInput = {
  summary: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  attendeeWecomUserIds: string[];
};

export type CreateWecomScheduleResult =
  | { ok: true; scheduleId: string }
  | { ok: false; error: string };

export function isWecomScheduleConfigured(): boolean {
  const cfg = resolveWecomOauthConfig();
  return !!(cfg?.corpId && cfg.appSecret && cfg.agentId?.trim());
}

function apiError(prefix: string, data: WecomApiError): string {
  if (data.errcode === 60011) {
    return (
      `${prefix}: 60011 应用对参与人没有权限。请管理员在企微「协作 → 日程 → 可调用接口的应用」添加本自建应用，` +
      `并确保参与人都在应用可见范围内（WECOM_AGENT_ID 需与已授权应用一致）。`
    );
  }
  return `${prefix}: ${data.errcode ?? "unknown"} ${data.errmsg ?? ""}`.trim();
}

function normalizeAttendees(ids: string[]): string[] {
  return [...new Set(ids.map((id) => sanitizeWecomUserId(id)).filter(isValidWecomUserId))];
}

export async function createWecomSchedule(
  input: CreateWecomScheduleInput,
): Promise<CreateWecomScheduleResult> {
  const cfg = resolveWecomOauthConfig();
  if (!cfg?.agentId?.trim()) {
    return { ok: false, error: "WeCom schedule is not configured. Set WECOM_CORP_ID, WECOM_APP_SECRET, and WECOM_AGENT_ID." };
  }

  const attendees = normalizeAttendees(input.attendeeWecomUserIds);
  if (!attendees.length) {
    return { ok: false, error: "No valid WeCom attendee userids." };
  }

  const startSec = Math.floor(input.startTime.getTime() / 1000);
  const endSec = Math.floor(input.endTime.getTime() / 1000);
  if (endSec <= startSec) {
    return { ok: false, error: "End time must be after start time." };
  }

  const agentid = Number.parseInt(cfg.agentId, 10);
  if (!Number.isFinite(agentid)) {
    return { ok: false, error: `Invalid WECOM_AGENT_ID: ${cfg.agentId}` };
  }

  const schedule: Record<string, unknown> = {
    summary: input.summary.trim().slice(0, 128) || "会议",
    start_time: startSec,
    end_time: endSec,
    attendees: attendees.map((userid) => ({ userid })),
    reminders: {
      is_remind: 1,
      remind_before_event_secs: 900,
    },
  };

  const description = input.description?.trim();
  const location = input.location?.trim();
  if (description) schedule.description = description.slice(0, 1000);
  if (location) schedule.location = location.slice(0, 128);

  try {
    const accessToken = await getWecomAccessToken(cfg);
    const url = new URL("/cgi-bin/oa/schedule/add", cfg.apiBaseUrl);
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule, agentid }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      return { ok: false, error: `WeCom schedule/add failed: HTTP ${res.status}` };
    }

    const data = (await res.json()) as WecomScheduleAddResponse;
    if (data.errcode && data.errcode !== 0) {
      return { ok: false, error: apiError("WeCom schedule/add failed", data) };
    }
    if (!data.schedule_id) {
      return { ok: false, error: "WeCom schedule/add returned no schedule_id" };
    }

    return { ok: true, scheduleId: data.schedule_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "WeCom schedule/add failed." };
  }
}
