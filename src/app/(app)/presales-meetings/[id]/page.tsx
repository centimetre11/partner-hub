import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PresalesMeetingWorkspace } from "./meeting-workspace";
import { toMeetingClient } from "@/lib/presales-meeting/meeting-client";
import {
  backfillPresalesItemSubjects,
  loadPrepFacts,
} from "@/lib/presales-meeting/prep-facts";

export default async function PresalesMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  await backfillPresalesItemSubjects(id);

  const [meeting, users, partners, customers] = await Promise.all([
    db.presalesProjectMeeting.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            user: { select: { name: true } },
            customer: { select: { name: true } },
            project: { select: { name: true, phase: true } },
            opportunity: { select: { name: true } },
            partner: { select: { name: true } },
            todoDrafts: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    }),
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
    db.customer.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
  ]);
  if (!meeting) notFound();

  const client = toMeetingClient(meeting);
  const factsEntries = await Promise.all(
    meeting.items.map(async (it) => {
      const facts = await loadPrepFacts({
        subjectKind: it.subjectKind,
        customerId: it.customerId,
        projectId: it.projectId,
        opportunityId: it.opportunityId,
        partnerId: it.partnerId,
        since: meeting.factsSince,
        until: meeting.factsUntil,
      });
      return [it.id, facts] as const;
    }),
  );
  const prepFactsByItemId = Object.fromEntries(factsEntries);

  return (
    <div className="pb-20 space-y-0">
      <PageHeader
        title={meeting.title}
        desc={`${meeting.items.length} agenda · ${meeting.status}`}
      />
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl">
        <PresalesMeetingWorkspace
          initial={client}
          prepFactsByItemId={prepFactsByItemId}
          todoContext={{
            currentUserId: user.id,
            users,
            partners,
            customers,
          }}
        />
      </div>
    </div>
  );
}
