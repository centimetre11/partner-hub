import { getUserMeetAccessToken } from "./google-meet-oauth";
import { toGoogleCalendarDateTime } from "./meeting-datetime";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type CalendarEvent = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
    conferenceSolution?: { key?: { type?: string } };
  };
};

export type CreateMeetLinkInput = {
  summary?: string;
  /** datetime-local 墙钟（与 timeZone 配套，供 Google Calendar API） */
  startLocal: string;
  endLocal: string;
  /** UTC 瞬间（供校验与其它系统） */
  start: Date;
  end: Date;
  timeZone: string;
};

export type CreateMeetLinkResult = {
  meetLink: string;
  deleteWarning?: string;
};

function extractMeetLink(event: CalendarEvent): string | null {
  if (event.hangoutLink?.startsWith("http")) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video" && e.uri?.startsWith("http"),
  );
  return video?.uri ?? null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function createMeetLinkForUser(
  userId: string,
  input: CreateMeetLinkInput,
): Promise<CreateMeetLinkResult> {
  const accessToken = await getUserMeetAccessToken(userId);
  const requestId = crypto.randomUUID();
  const summary = input.summary?.trim() || "Partner Hub Meeting";

  const startDateTime = toGoogleCalendarDateTime(input.startLocal);
  const endDateTime = toGoogleCalendarDateTime(input.endLocal);
  if (!startDateTime || !endDateTime) {
    throw new Error("Invalid meeting start or end time");
  }

  const body = {
    summary,
    start: { dateTime: startDateTime, timeZone: input.timeZone },
    end: { dateTime: endDateTime, timeZone: input.timeZone },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const createUrl = new URL(`${CALENDAR_API}/calendars/primary/events`);
  createUrl.searchParams.set("conferenceDataVersion", "1");

  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!createRes.ok) {
    const err = (await createRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Calendar API create failed (${createRes.status})`);
  }

  let event = (await createRes.json()) as CalendarEvent;
  let meetLink = extractMeetLink(event);

  for (let i = 0; i < 3 && !meetLink; i++) {
    await sleep(400);
    if (!event.id) break;
    const getRes = await fetch(`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(event.id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!getRes.ok) break;
    event = (await getRes.json()) as CalendarEvent;
    meetLink = extractMeetLink(event);
  }

  if (!meetLink) {
    throw new Error("Google Meet link was not returned — try again or reconnect Google in Account settings");
  }

  let deleteWarning: string | undefined;
  if (event.id) {
    try {
      const delRes = await fetch(
        `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(event.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!delRes.ok && delRes.status !== 404) {
        deleteWarning = `Temporary calendar event could not be deleted (HTTP ${delRes.status})`;
      }
    } catch (e) {
      deleteWarning = e instanceof Error ? e.message : "Temporary calendar event could not be deleted";
    }
  }

  return { meetLink, deleteWarning };
}
