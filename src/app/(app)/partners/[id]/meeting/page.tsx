import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { MeetingClient } from "./meeting-client";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const partner = await db.partner.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { attitude: "desc" } },
      opportunities: { where: { status: "ACTIVE" } },
    },
  });
  if (!partner) notFound();

  return (
    <MeetingClient
      partner={{
        id: partner.id,
        name: partner.name,
        pipelineStage: partner.pipelineStage,
        contacts: partner.contacts.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          title: c.title,
          department: c.department,
          attitude: c.attitude,
        })),
        opportunities: partner.opportunities.map((o) => ({
          id: o.id,
          name: o.name,
          client: o.client,
          amount: o.amount,
          stage: o.stage,
        })),
      }}
    />
  );
}
