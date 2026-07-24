import { db } from "./db";
import { getUserGoogleMeetStatus } from "./google-meet-oauth";
import { isWecomScheduleConfigured } from "./wecom-schedule";

export type MeetingInviteOption = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactName: string | null;
};

export type MeetingSchedulerContext = {
  googleMeetConnected: boolean;
  googleEmail: string | null;
  googleClientConfigured: boolean;
  wecomScheduleConfigured: boolean;
  boundUsers: { id: string; name: string; email: string }[];
  invitePartners: MeetingInviteOption[];
};

export async function getMeetingSchedulerContext(userId: string): Promise<MeetingSchedulerContext> {
  const [meetStatus, boundUsers, partners] = await Promise.all([
    getUserGoogleMeetStatus(userId),
    db.user.findMany({
      where: { wecomUserId: { not: null } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        contacts: {
          where: { email: { not: null } },
          select: { name: true, email: true },
          orderBy: { attitude: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const invitePartners: MeetingInviteOption[] = partners.map((p) => ({
    id: p.id,
    name: p.name,
    contactEmail: p.contacts[0]?.email ?? null,
    contactName: p.contacts[0]?.name ?? null,
  }));

  return {
    googleMeetConnected: meetStatus.connected,
    googleEmail: meetStatus.googleEmail,
    googleClientConfigured: meetStatus.clientConfigured,
    wecomScheduleConfigured: isWecomScheduleConfigured(),
    boundUsers,
    invitePartners,
  };
}
