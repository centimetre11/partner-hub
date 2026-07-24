"use client";

import Link from "next/link";
import { useMessages } from "@/lib/i18n/context";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { CreateBusinessRecordDrawer } from "@/components/create-business-record-drawer";
import { AiAddButton } from "@/components/ai-add-button";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import {
  MeetingCustomerInviteScheduler,
  MeetingScheduler,
  type MeetingCustomerOption,
} from "@/components/meeting-scheduler";
import type { BoundUserWithEmail } from "@/components/meeting-customer-invite-form";
import { MOSS_ENABLED } from "@/lib/feature-flags";

type Option = { id: string; name: string };
type BoundUser = BoundUserWithEmail;

const cardActionBtn =
  "inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40";

function ChevronRightIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-45"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function QuickActionCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group flex min-h-[8.5rem] flex-col rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-4 shadow-sm transition-all hover:border-slate-300/90 hover:shadow-md">
      <div className="text-sm font-semibold tracking-tight text-slate-900">{title}</div>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-500">{desc}</p>
      <div className="mt-3 flex justify-end border-t border-slate-100/80 pt-3">{children}</div>
    </div>
  );
}

export function DashboardQuickActions({
  userId,
  userName,
  partners,
  customers,
  inviteCustomers,
  invitePartners = [],
  users,
  googleMeetConnected,
  wecomScheduleConfigured,
  boundUsers,
}: {
  userId: string;
  userName: string;
  partners: Option[];
  customers: Option[];
  inviteCustomers: MeetingCustomerOption[];
  invitePartners?: MeetingCustomerOption[];
  users: Option[];
  googleMeetConnected: boolean;
  wecomScheduleConfigured: boolean;
  boundUsers: BoundUser[];
}) {
  const m = useMessages();
  const q = m.dashboard.quickActions;
  const meeting = m.dashboard.scheduleMeeting;
  const meetingInvite = m.dashboard.scheduleMeetingInvite;
  const openLabel = q.actionOpen;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 px-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {MOSS_ENABLED && (
        <QuickActionCard title={q.mossTitle} desc={q.mossDesc}>
          <Link href="/moss" className={cardActionBtn}>
            {openLabel}
            <ChevronRightIcon />
          </Link>
        </QuickActionCard>
      )}

      <QuickActionCard title={m.dashboard.createTodo} desc={q.createTodoDesc}>
        <CreateTodoDrawer
          userId={userId}
          partners={partners}
          customers={customers}
          users={users}
          buttonClassName={cardActionBtn}
          buttonLabel={openLabel}
          buttonSuffix={<ChevronRightIcon />}
        />
      </QuickActionCard>

      <QuickActionCard title={q.businessRecordTitle} desc={q.businessRecordDesc}>
        <CreateBusinessRecordDrawer
          partners={partners}
          customers={customers}
          buttonClassName={cardActionBtn}
          buttonLabel={openLabel}
          buttonSuffix={<ChevronRightIcon />}
        />
      </QuickActionCard>

      <QuickActionCard title={q.partnerAiTitle} desc={m.dashboard.aiOnboardingDesc}>
        <AiAddButton
          scope="new_partner"
          label={openLabel}
          suffix={<ChevronRightIcon />}
          className={cardActionBtn}
        />
      </QuickActionCard>

      <QuickActionCard title={q.customerAiTitle} desc={m.dashboard.customerAiOnboardingDesc}>
        <CustomerAiIntakeButton
          label={openLabel}
          suffix={<ChevronRightIcon />}
          className={cardActionBtn}
        />
      </QuickActionCard>

      <QuickActionCard title={meeting.title} desc={meeting.desc}>
        <MeetingScheduler
          currentUserId={userId}
          organizerName={userName}
          googleMeetConnected={googleMeetConnected}
          wecomScheduleConfigured={wecomScheduleConfigured}
          boundUsers={boundUsers}
          variant="drawer"
          buttonClassName={cardActionBtn}
          buttonLabel={openLabel}
          buttonSuffix={<ChevronRightIcon />}
        />
      </QuickActionCard>

      <QuickActionCard title={meetingInvite.title} desc={meetingInvite.desc}>
        <MeetingCustomerInviteScheduler
          currentUserId={userId}
          organizerName={userName}
          googleMeetConnected={googleMeetConnected}
          wecomScheduleConfigured={wecomScheduleConfigured}
          boundUsers={boundUsers}
          customers={inviteCustomers}
          partners={invitePartners}
          buttonClassName={cardActionBtn}
          buttonLabel={openLabel}
          buttonSuffix={<ChevronRightIcon />}
        />
      </QuickActionCard>
    </div>
  );
}
