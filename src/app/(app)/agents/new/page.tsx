import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { DEFAULT_AGENT_SKILLS } from "@/lib/skills";
import { resolveAgentSkills } from "@/lib/skill-resolver";
import { AgentForm } from "../agent-form";

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
      <PageHeader title="创建 Agent" desc="写一段指令，勾选技能，选触发方式——组装你自己的自动化助手" />
      <div className="px-8 max-w-3xl">
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
  );
}
