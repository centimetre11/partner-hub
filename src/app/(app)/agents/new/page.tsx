import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { DEFAULT_AGENT_SKILLS } from "@/lib/skills";
import { resolveAgentSkills } from "@/lib/skill-resolver";
import { AgentForm } from "../agent-form";
import { AgentBuilder } from "../agent-builder";

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const { toolOptions, promptSkillOptions } = await resolveAgentSkills();

  return (
    <div className="pb-16">
      <PageHeader title="Create Agent" desc="Generate a draft via chat, or manually configure instructions, tool kit, and skill library" />
      <AiCenterNav />
      <div className="px-8 space-y-8">
        <AgentBuilder />
        <div className="max-w-3xl">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-zinc-800">Manual Create</h2>
            <p className="text-xs text-zinc-400 mt-1">Best when you already know which tools and skills to select and how to write task instructions.</p>
          </div>
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
    </div>
  );
}
