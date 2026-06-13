import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { upsertSkillAction } from "@/lib/content-actions";

export default async function NewSkillPage() {
  await requireUser();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title="新建提示词 Skill" desc="注入一段提示词片段，Agent 运行时附加到系统指令中" />
      <form action={upsertSkillAction} className="px-8 max-w-3xl space-y-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="name" required placeholder="标识名（英文，如 joint_solution_outline）" className={input} />
          <input name="label" required placeholder="显示名称 *" className={input} />
          <input name="description" placeholder="一句话说明" className={input} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked className="rounded" />
            团队共享
          </label>
          <textarea
            name="promptBody"
            required
            rows={12}
            placeholder="提示词正文：告诉 Agent 在特定场景下如何思考、输出什么结构…"
            className={input}
          />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">保存</button>
      </form>
    </div>
  );
}
