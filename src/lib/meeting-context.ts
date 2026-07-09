import { db } from "./db";
import { getUserGoogleMeetStatus } from "./google-meet-oauth";
import { isWecomScheduleConfigured } from "./wecom-schedule";

export type MeetingSchedulerContext = {
  googleMeetConnected: boolean;
  googleEmail: string | null;
  googleClientConfigured: boolean;
  wecomScheduleConfigured: boolean;
  boundUsers: { id: string; name: string }[];
};

export async function getMeetingSchedulerContext(userId: string): Promise<MeetingSchedulerContext> {
  const [meetStatus, boundUsers] = await Promise.all([
    getUserGoogleMeetStatus(userId),
    db.user.findMany({
      where: { wecomUserId: { not: null } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    googleMeetConnected: meetStatus.connected,
    googleEmail: meetStatus.googleEmail,
    googleClientConfigured: meetStatus.clientConfigured,
    wecomScheduleConfigured: isWecomScheduleConfigured(),
    boundUsers,
  };
}
