import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { AssistantDock } from "@/components/assistant-dock";
import { LocaleProvider } from "@/lib/i18n/context";
import { getLocale } from "@/lib/i18n/locale-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { readAt: null } });
  const locale = await getLocale();

  return (
    <LocaleProvider locale={locale}>
      <AppShell user={{ name: user.name, email: user.email, role: user.role }} unread={unread} locale={locale}>
        {children}
      </AppShell>
      <AssistantDock />
    </LocaleProvider>
  );
}
