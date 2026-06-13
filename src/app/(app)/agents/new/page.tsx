import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
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
  const { skillOptions } = await resolveAgentSkills();

  return (
    <div className="pb-16">
      <PageHeader title="创建 Agent" desc="用对话生成草案，或继续手动填写指令、Skill、触发方式" />
      <div className="px-8 space-y-8">
        <AgentBuilder />
        <div className="max-w-3xl">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-zinc-800">手动创建</h2>
            <p className="text-xs text-zinc-400 mt-1">适合你已经明确知道要勾选哪些 Skill、如何写任务指令。</p>
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
            skillOptions={skillOptions}
            partners={partners}
          />
        </div>
      </div>
    </div>
  );
}
