import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { AssistantDock } from "@/components/assistant-dock";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { readAt: null } });

  return (
    <>
      <AppShell user={{ name: user.name, email: user.email }} unread={unread}>
        {children}
      </AppShell>
      <AssistantDock />
    </>
  );
}
