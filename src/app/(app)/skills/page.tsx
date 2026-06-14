import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { deleteSkillAction, cloneSkillAction } from "@/lib/content-actions";

export default async function SkillsPage() {
  await requireUser();
  const skills = await db.skill.findMany({
    where: { kind: "PROMPT", isBuiltin: false },
    orderBy: [{ shared: "desc" }, { label: "asc" }],
  });

  const equippedCount = await db.agentSkill.count({
    where: { skillId: { in: skills.map((s) => s.id) } },
  });

  return (
    <div className="pb-16">
      <PageHeader
        title="技能书"
        desc="为 Agent 装备可复用的方法论和专业流程——告诉 Agent「怎么做」，而非「能做什么」"
        actions={
          <Link href="/skills/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            + 新建技能
          </Link>
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-4xl space-y-4">
        <div className="rounded-xl border border-purple-100 bg-purple-50/40 px-4 py-3 text-sm text-purple-900/80">
          <span className="font-medium">技能如何生效：</span>
          勾选后，技能正文会注入 Agent 的系统指令。Agent 仍需要搭配
          <Link href="/tools" className="text-purple-700 hover:underline mx-0.5">工具</Link>
          才能执行具体操作。例：「深度调研」技能规定调研框架，「web_search」工具负责搜索。
        </div>

        {skills.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200/80 p-8 text-center">
            <div className="text-2xl mb-2">⚡</div>
            <div className="text-sm font-medium text-zinc-800">还没有自定义技能</div>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              把团队沉淀的方法论（会前简报结构、联合方案框架、竞品分析 SOP）写成技能，供 Agent 复用。
            </p>
            <Link href="/skills/new" className="inline-block mt-4 text-sm text-indigo-600 hover:underline">
              创建第一个技能 →
            </Link>
          </div>
        ) : (
          <>
            <div className="text-xs text-zinc-400">{skills.length} 个技能 · {equippedCount} 次 Agent 装备</div>
            <div className="space-y-3">
              {skills.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border p-5 flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/skills/${s.id}`} className="font-semibold text-zinc-900 hover:text-indigo-600">
                        {s.label}
                      </Link>
                      <Badge tone="purple">方法论</Badge>
                      {s.shared && <Badge tone="zinc">共享</Badge>}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 font-mono">{s.name}</div>
                    {s.description && <p className="text-sm text-zinc-500 mt-2">{s.description}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <form action={cloneSkillAction.bind(null, s.id)}>
                      <button className="text-xs text-zinc-400 hover:text-indigo-600">克隆</button>
                    </form>
                    <form action={deleteSkillAction.bind(null, s.id)}>
                      <button className="text-xs text-zinc-400 hover:text-red-600">删除</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
