import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BuilderModeToggle } from "@/components/builder-mode-toggle";
import { AgentBuilder } from "../agent-builder";
import { getServerI18n } from "@/lib/server-i18n";

export default async function NewAgentPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();

  return (
    <div className="pb-8">
      <PageHeader
        title={m.agents.createTitle}
        desc={m.agents.createDesc}
        actions={
          <BuilderModeToggle active="auto" autoHref="/agents/new" manualHref="/agents/new/manual" />
        }
      />
      <AiCenterNav />
      <div className="px-8">
        <AgentBuilder />
      </div>
    </div>
  );
}
