import { db } from "@/lib/db";
import { AutomationForm } from "@/components/automation-form";
import { requireUser } from "@/lib/session";
import { AiCenterNav } from "@/components/ai-center-nav";
import { DEFAULT_AUTOMATION_QUERY } from "@/lib/automation-query";

export default async function NewAutomationPage() {
  await requireUser();
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="pb-8">
      <AiCenterNav />
      <AutomationForm
        partners={partners}
        builderMode="manual"
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
