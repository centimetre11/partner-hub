import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PresalesMeetingWorkspace } from "./meeting-workspace";
import { toMeetingClient } from "@/lib/presales-meeting/meeting-client";
import { loadPrepFacts } from "@/lib/presales-meeting/prep-facts";

export default async function PresalesMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          user: { select: { name: true } },
          customer: { select: { name: true } },
          project: { select: { name: true, phase: true } },
          todoDrafts: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!meeting) notFound();

  const client = toMeetingClient(meeting);
  const factsEntries = await Promise.all(
    meeting.items.map(async (it) => {
      const facts = await loadPrepFacts({
        customerId: it.customerId,
        projectId: it.projectId,
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
        />
      </div>
    </div>
  );
}
