import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { deleteSkillAction, cloneSkillAction } from "@/lib/content-actions";

export default async function SkillsPage() {
  await requireUser();
  const skills = await db.skill.findMany({ orderBy: [{ isBuiltin: "desc" }, { label: "asc" }] });

  return (
    <div className="pb-16">
      <PageHeader
        title="Skill 库"
        desc="AI 中心的一部分：内置工具技能 + 团队共享提示词技能，供 Agent Builder 自动匹配"
        actions={
          <>
            <Link href="/ai" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
              AI 中心
            </Link>
            <Link href="/skills/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
              + 新建提示词 Skill
            </Link>
          </>
        }
      />
      <div className="px-8 max-w-4xl space-y-3">
        {skills.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border p-5 flex justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {s.isBuiltin ? (
                  <span className="font-semibold text-zinc-900">{s.label}</span>
                ) : (
                  <Link href={`/skills/${s.id}`} className="font-semibold text-zinc-900 hover:text-indigo-600">{s.label}</Link>
                )}
                <Badge tone={s.isBuiltin ? "indigo" : "purple"}>{s.isBuiltin ? "内置" : "提示词"}</Badge>
                {s.shared && <Badge tone="zinc">共享</Badge>}
              </div>
              <div className="text-xs text-zinc-400 mt-1 font-mono">{s.name}</div>
              {s.description && <p className="text-sm text-zinc-500 mt-2">{s.description}</p>}
            </div>
            {!s.isBuiltin && (
              <div className="flex gap-2 shrink-0">
                <form action={cloneSkillAction.bind(null, s.id)}>
                  <button className="text-xs text-zinc-400 hover:text-indigo-600">克隆</button>
                </form>
                <form action={deleteSkillAction.bind(null, s.id)}>
                  <button className="text-xs text-zinc-400 hover:text-red-600">删除</button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
