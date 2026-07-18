"use client";

import { useMessages } from "@/lib/i18n/context";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { AiAddButton } from "@/components/ai-add-button";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import { MeetingScheduler } from "@/components/meeting-scheduler";

type Option = { id: string; name: string };
type BoundUser = { id: string; name: string };

const cardActionBtn =
  "w-full inline-flex justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800";

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
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500">{desc}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function DashboardQuickActions({
  userId,
  partners,
  customers,
  users,
  googleMeetConnected,
  wecomScheduleConfigured,
  boundUsers,
}: {
  userId: string;
  partners: Option[];
  customers: Option[];
  users: Option[];
  googleMeetConnected: boolean;
  wecomScheduleConfigured: boolean;
  boundUsers: BoundUser[];
}) {
  const m = useMessages();
  const q = m.dashboard.quickActions;
  const meeting = m.dashboard.scheduleMeeting;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 px-8 sm:grid-cols-2 xl:grid-cols-4">
      <QuickActionCard title={m.dashboard.createTodo} desc={q.createTodoDesc}>
        <CreateTodoDrawer
          userId={userId}
          partners={partners}
          customers={customers}
          users={users}
          buttonClassName={cardActionBtn}
        />
      </QuickActionCard>

      <QuickActionCard title={q.partnerAiTitle} desc={m.dashboard.aiOnboardingDesc}>
        <AiAddButton
          scope="new_partner"
          label={m.dashboard.startOnboarding}
          variant="solid"
          className={cardActionBtn}
        />
      </QuickActionCard>

      <QuickActionCard title={q.customerAiTitle} desc={m.dashboard.customerAiOnboardingDesc}>
        <CustomerAiIntakeButton
          label={m.dashboard.startCustomerOnboarding}
          variant="primary"
          className={cardActionBtn}
        />
      </QuickActionCard>

      <QuickActionCard title={meeting.title} desc={meeting.desc}>
        <MeetingScheduler
          currentUserId={userId}
          googleMeetConnected={googleMeetConnected}
          wecomScheduleConfigured={wecomScheduleConfigured}
          boundUsers={boundUsers}
          variant="drawer"
          buttonClassName={cardActionBtn}
        />
      </QuickActionCard>
    </div>
  );
}
