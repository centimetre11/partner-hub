import { requireUser } from "@/lib/session";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BuilderModeToggle } from "@/components/builder-mode-toggle";
import { AutomationBuilder } from "@/components/automation-builder";
import { getServerI18n } from "@/lib/server-i18n";

export default async function NewAutomationAiPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();

  return (
    <div className="pb-8">
      <AiCenterNav />
      <div className="px-6 pt-2 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{m.automations.createTitle}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{m.automations.createDesc}</p>
          </div>
          <BuilderModeToggle
            active="auto"
            autoHref="/automations/new/ai"
            manualHref="/automations/new"
          />
        </div>
        <AutomationBuilder />
      </div>
    </div>
  );
}
