import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PresalesMeetingsClient } from "./meetings-client";
import { getLocale } from "@/lib/i18n/locale-server";
import { getMessages } from "@/lib/i18n/messages";
import { parseListPage } from "@/lib/list-pagination";

export default async function PresalesMeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "active";
  const { page, take, skip } = parseListPage(sp.page);
  const locale = await getLocale();
  const msgs = getMessages(locale);
  const m = msgs.presalesMeeting;

  const meetingWhere =
    tab === "history" ? { status: "DONE" as const } : { status: { not: "DONE" as const } };

  const [
    meetings,
    total,
    users,
    customers,
    projects,
    partners,
    opportunities,
    partnerLinks,
  ] = await Promise.all([
    db.presalesProjectMeeting.findMany({
      where: meetingWhere,
      orderBy:
        tab === "history"
          ? [{ endedAt: "desc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
      skip,
      take,
      include: {
        createdBy: { select: { name: true } },
        items: {
          select: {
            id: true,
            subjectKind: true,
            user: { select: { name: true } },
            customer: { select: { name: true } },
            project: { select: { name: true } },
            opportunity: { select: { name: true } },
            partner: { select: { name: true } },
          },
        },
      },
    }),
    db.presalesProjectMeeting.count({ where: meetingWhere }),
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    db.customer.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        ownerId: true,
        presalesUserId: true,
      },
    }),
    db.project.findMany({
      where: { status: { not: "CLOSED" } },
      orderBy: { name: "asc" },
      take: 1000,
      select: {
        id: true,
        name: true,
        customerId: true,
        ownerId: true,
        partnerId: true,
      },
    }),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        ownerId: true,
        salesUserId: true,
        presalesUserId: true,
      },
    }),
    db.opportunity.findMany({
      where: { status: { notIn: ["WON", "LOST"] } },
      orderBy: { updatedAt: "desc" },
      take: 1000,
      select: {
        id: true,
        name: true,
        customerId: true,
        partnerId: true,
        status: true,
      },
    }),
    db.customerPartner.findMany({
      select: { partnerId: true, customerId: true },
      take: 3000,
    }),
  ]);

  return (
    <div className="pb-16 space-y-0">
      <PageHeader title={m.title} desc={m.desc} />
      <PresalesMeetingsClient
        tab={tab}
        page={page}
        pageSize={take}
        total={total}
        users={users}
        customers={customers}
        projects={projects}
        partners={partners}
        opportunities={opportunities}
        partnerLinks={partnerLinks}
        meetings={meetings.map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          status: meeting.status,
          createdByName: meeting.createdBy.name,
          items: meeting.items.map((it) => {
            const subject =
              it.subjectKind === "PARTNER"
                ? `伙伴 · ${it.partner?.name ?? "—"}`
                : it.subjectKind === "OPPORTUNITY"
                  ? `商机 · ${it.opportunity?.name ?? "—"}`
                  : it.subjectKind === "CUSTOMER"
                    ? `客户 · ${it.customer?.name ?? "—"}`
                    : `${it.customer?.name ?? "—"} / ${it.project?.name ?? "—"}`;
            return {
              userName: it.user.name,
              subject,
            };
          }),
        }))}
      />
    </div>
  );
}
