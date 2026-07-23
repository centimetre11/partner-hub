"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ListPagination } from "@/components/list-pagination";
import { CreatePresalesMeetingForm } from "./create-form";
import { DeletePresalesMeetingButton } from "./delete-meeting-button";
import type {
  CustomerOpt,
  OpportunityOpt,
  PartnerCustomerLink,
  PartnerOpt,
  ProjectOpt,
} from "./owned-picker";
import { formatMsg } from "@/lib/i18n/messages";
import { useMessages } from "@/lib/i18n/context";

type UserOpt = { id: string; name: string; role: string };

type MeetingRow = {
  id: string;
  title: string;
  status: string;
  createdByName: string;
  items: { userName: string; subject: string }[];
};

export function PresalesMeetingsClient({
  tab,
  meetings,
  total,
  page,
  pageSize,
  users,
  customers,
  projects,
  partners,
  opportunities,
  partnerLinks,
}: {
  tab: "active" | "history";
  meetings: MeetingRow[];
  total: number;
  page: number;
  pageSize: number;
  users: UserOpt[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  partners: PartnerOpt[];
  opportunities: OpportunityOpt[];
  partnerLinks: PartnerCustomerLink[];
}) {
  const msgs = useMessages();
  const m = msgs.presalesMeeting;
  const [creating, setCreating] = useState(false);

  const STATUS_LABEL: Record<
    string,
    { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }
  > = {
    DRAFT: { label: m.statusDraft, tone: "zinc" },
    PREP: { label: m.statusPrep, tone: "blue" },
    LIVE: { label: m.statusLive, tone: "amber" },
    PROCESSING: { label: m.statusProcessing, tone: "purple" },
    DONE: { label: m.statusDone, tone: "green" },
  };

  const pageLabels = {
    prevPage: msgs.common.prevPage,
    nextPage: msgs.common.nextPage,
    pageOf: msgs.common.pageOf,
  };
  const filterParams = { tab: tab === "history" ? "history" : undefined };

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      active
        ? "border-slate-900 text-slate-900"
        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
    }`;

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-4 max-w-7xl">
      {tab === "active" ? (
        <CreatePresalesMeetingForm
          users={users}
          customers={customers}
          projects={projects}
          partners={partners}
          opportunities={opportunities}
          partnerLinks={partnerLinks}
          onOpenChange={setCreating}
        />
      ) : null}

      {creating ? null : (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            <Link href="/presales-meetings" className={tabClass(tab === "active")}>
              {m.activeTab}
            </Link>
            <Link href="/presales-meetings?tab=history" className={tabClass(tab === "history")}>
              {m.historyTab}
            </Link>
          </div>

          {!meetings.length ? (
            <EmptyState text={m.empty} />
          ) : (
            <div className="space-y-3">
              {meetings.map((meeting) => {
                const st = STATUS_LABEL[meeting.status] ?? STATUS_LABEL.DRAFT!;
                return (
                  <Card key={meeting.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/presales-meetings/${meeting.id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-sky-800"
                          >
                            {meeting.title}
                          </Link>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          {meeting.createdByName}
                          {" · "}
                          {formatMsg(m.itemsCount, { n: meeting.items.length })}
                        </p>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {meeting.items
                            .slice(0, 4)
                            .map((it) => `${it.userName} · ${it.subject}`)
                            .join(" · ")}
                          {meeting.items.length > 4 ? "…" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link
                          href={`/presales-meetings/${meeting.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                        >
                          {m.openWorkspace}
                        </Link>
                        <DeletePresalesMeetingButton
                          meetingId={meeting.id}
                          meetingTitle={meeting.title}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
              <ListPagination
                pathname="/presales-meetings"
                searchParams={filterParams}
                page={page}
                pageSize={pageSize}
                total={total}
                labels={pageLabels}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
