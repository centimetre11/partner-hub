import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BuilderModeToggle } from "@/components/builder-mode-toggle";
import { AutomationBuilder } from "@/components/automation-builder";
import { getServerI18n } from "@/lib/server-i18n";

export default async function NewAutomationPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();

  return (
    <div className="pb-8">
      <PageHeader
        title={m.automations.createTitle}
        desc={m.automations.createDesc}
        actions={
          <BuilderModeToggle
            active="auto"
            autoHref="/automations/new"
            manualHref="/automations/new/manual"
          />
        }
      />
      <AiCenterNav />
      <div className="px-8">
        <AutomationBuilder />
      </div>
    </div>
  );
}
