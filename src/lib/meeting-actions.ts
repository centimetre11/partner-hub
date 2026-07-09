"use server";

import { db } from "./db";
import { requireUser } from "./session";
import { createMeetLinkForUser } from "./google-meet-link";
import { getUserGoogleMeetStatus } from "./google-meet-oauth";
import { resolveHubUserIdsToWecomUserIds, sendWecomAppMessage } from "./wecom-app-message";
import { createWecomSchedule, isWecomScheduleConfigured } from "./wecom-schedule";

export type CreateMeetingResult =
  | {
      ok: true;
      meetLink: string;
      wecomScheduleId: string;
      warnings: string[];
    }
  | { ok: false; error: string; code?: string };

function parseAttendeeIds(raw: FormData): string[] {
  const ids = raw.getAll("attendeeUserIds").map((v) => String(v).trim()).filter(Boolean);
  if (ids.length) return [...new Set(ids)];
  const single = String(raw.get("attendeeUserIds") ?? "").trim();
  if (!single) return [];
  return [...new Set(single.split(/[,;|]/).map((s) => s.trim()).filter(Boolean))];
}

function parseDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createMeetingAction(formData: FormData): Promise<CreateMeetingResult> {
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const startAt = parseDateTime(String(formData.get("startAt") ?? ""));
  const endAt = parseDateTime(String(formData.get("endAt") ?? ""));
  const timeZone = String(formData.get("timeZone") ?? "").trim() || "UTC";
  const notifyAttendees = formData.get("notifyAttendees") !== "false";

  if (!title) return { ok: false, error: "Meeting title is required" };
  if (!startAt || !endAt) return { ok: false, error: "Start and end time are required" };
  if (endAt <= startAt) return { ok: false, error: "End time must be after start time" };

  if (!isWecomScheduleConfigured()) {
    return { ok: false, error: "WeCom schedule is not configured on the server.", code: "wecom_not_configured" };
  }

  const meetStatus = await getUserGoogleMeetStatus(user.id);
  if (!meetStatus.connected) {
    return {
      ok: false,
      error: "Connect your Google account in Account settings before creating a meeting.",
      code: "google_not_connected",
    };
  }

  const warnings: string[] = [];
  let attendeeUserIds = parseAttendeeIds(formData);

  const self = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, wecomUserId: true },
  });
  if (self?.wecomUserId && !attendeeUserIds.includes(user.id)) {
    attendeeUserIds = [user.id, ...attendeeUserIds];
  }

  if (!attendeeUserIds.length) {
    return { ok: false, error: "Select at least one attendee with a bound WeCom account." };
  }

  const resolved = await resolveHubUserIdsToWecomUserIds(attendeeUserIds);
  if (resolved.missingHubUserIds.length) {
    warnings.push(`Hub user not found: ${resolved.missingHubUserIds.join(", ")}`);
  }
  if (resolved.unboundHubUserIds.length) {
    warnings.push(`User without WeCom binding: ${resolved.unboundHubUserIds.join(", ")}`);
  }
  if (!resolved.wecomUserIds.length) {
    return { ok: false, error: "No attendees with bound WeCom accounts." };
  }

  let meetLink: string;
  try {
    const meet = await createMeetLinkForUser(user.id, {
      summary: title,
      start: startAt,
      end: endAt,
      timeZone,
    });
    meetLink = meet.meetLink;
    if (meet.deleteWarning) warnings.push(meet.deleteWarning);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create Google Meet link" };
  }

  const description = `Google Meet: ${meetLink}`;
  const scheduleResult = await createWecomSchedule({
    summary: title,
    description,
    location: meetLink,
    startTime: startAt,
    endTime: endAt,
    attendeeWecomUserIds: resolved.wecomUserIds,
  });

  if (!scheduleResult.ok) {
    return { ok: false, error: scheduleResult.error };
  }

  if (notifyAttendees) {
    const others = resolved.wecomUserIds.filter((id) => id !== self?.wecomUserId);
    const recipients = others.length ? others : resolved.wecomUserIds;
    const notify = await sendWecomAppMessage({
      touser: recipients,
      msgtype: "textcard",
      title: title.slice(0, 128),
      content: `时间：${startAt.toLocaleString()}\nGoogle Meet：${meetLink}`,
      url: meetLink,
      btntxt: "加入",
    });
    if (!notify.ok) warnings.push(`WeCom notification failed: ${notify.error}`);
    else if (notify.invaliduser?.length) {
      warnings.push(`Invalid WeCom userid(s): ${notify.invaliduser.join(", ")}`);
    }
  }

  return {
    ok: true,
    meetLink,
    wecomScheduleId: scheduleResult.scheduleId,
    warnings,
  };
}

export async function disconnectGoogleMeetAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const { disconnectUserMeet } = await import("./google-meet-oauth");
  await disconnectUserMeet(user.id);
  return { ok: true };
}
