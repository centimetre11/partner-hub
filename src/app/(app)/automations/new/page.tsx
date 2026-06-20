import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { AutomationBuilder } from "@/components/automation-builder";
import { getServerI18n } from "@/lib/server-i18n";

export default async function NewAutomationPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();

  return (
    <div className="pb-16">
      <PageHeader
        title={m.automations.createTitle}
        desc={m.automations.createDesc}
        actions={
          <Link
            href="/automations/new/manual"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {m.automations.manualCreate}
          </Link>
        }
      />
      <AiCenterNav />
      <div className="px-8">
        <AutomationBuilder />
      </div>
    </div>
  );
}
