import { requireUser } from "@/lib/session";
import { AiCenterNav } from "@/components/ai-center-nav";
import { AutomationBuilder } from "@/components/automation-builder";

export default async function NewAutomationAiPage() {
  await requireUser();

  return (
    <div className="pb-8">
      <AiCenterNav />
      <AutomationBuilder />
    </div>
  );
}
