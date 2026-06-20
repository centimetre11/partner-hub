import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BuilderModeToggle } from "@/components/builder-mode-toggle";
import { DEFAULT_AGENT_SKILLS } from "@/lib/skills";
import { resolveAgentSkills } from "@/lib/skill-resolver";
import { AgentForm } from "../../agent-form";
import { getServerI18n } from "@/lib/server-i18n";

export default async function ManualNewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  await requireUser();
  const { messages: m } = await getServerI18n();
  const sp = await searchParams;
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const { toolOptions, promptSkillOptions } = await resolveAgentSkills();

  return (
    <div className="pb-16">
      <PageHeader
        title={m.agents.createTitle}
        desc={m.agents.manualCreateDesc}
        actions={
          <BuilderModeToggle active="manual" autoHref="/agents/new" manualHref="/agents/new/manual" />
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-3xl pt-4">
        <AgentForm
          agent={{
            name: "",
            icon: "🤖",
            description: "",
            instructions: "",
            skills: DEFAULT_AGENT_SKILLS,
            skillIds: [],
            trigger: "MANUAL",
            frequency: "WEEKLY",
            runHour: 9,
            runWeekday: 1,
            scopeType: sp.partnerId ? "PARTNER" : "ALL",
            partnerId: sp.partnerId ?? "",
            shared: true,
            webhookUrl: "",
          }}
          toolOptions={toolOptions}
          promptSkillOptions={promptSkillOptions}
          partners={partners}
        />
      </div>
    </div>
  );
}
