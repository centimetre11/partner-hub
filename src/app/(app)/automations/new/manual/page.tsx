import { db } from "@/lib/db";
import { AutomationForm } from "@/components/automation-form";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BuilderModeToggle } from "@/components/builder-mode-toggle";
import { getServerI18n } from "@/lib/server-i18n";
import { DEFAULT_AUTOMATION_QUERY } from "@/lib/automation-query";

export default async function ManualNewAutomationPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="pb-8">
      <PageHeader
        title={m.automations.createTitle}
        desc={m.automations.manualCreateDesc}
        actions={
          <BuilderModeToggle
            active="manual"
            autoHref="/automations/new"
            manualHref="/automations/new/manual"
          />
        }
      />
      <AiCenterNav />
      <AutomationForm
        partners={partners}
        initial={{
          slug: "",
          name: "",
          cronExpr: "0 9 * * *",
          timezone: "Asia/Shanghai",
          wecomPushChatId: "",
          pushEmailTo: "",
          pushWecomAppTo: "",
          notifyOnSuccess: true,
          notifyOnFailure: true,
          enabled: true,
          query: { ...DEFAULT_AUTOMATION_QUERY },
        }}
      />
    </div>
  );
}
