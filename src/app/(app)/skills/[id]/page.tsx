import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { upsertSkillAction } from "@/lib/content-actions";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const s = await db.skill.findUnique({ where: { id } });
  if (!s || s.isBuiltin) notFound();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title={`编辑技能：${s.label}`} desc="方法论正文将注入 Agent 系统指令，指导如何组合工具完成任务" />
      <AiCenterNav />
      <form action={upsertSkillAction} className="px-8 max-w-3xl space-y-4">
        <input type="hidden" name="id" value={s.id} />
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="name" required defaultValue={s.name} placeholder="标识名（英文）" className={input} />
          <input name="label" required defaultValue={s.label} placeholder="显示名称" className={input} />
          <input name="description" defaultValue={s.description ?? ""} placeholder="一句话说明" className={input} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked={s.shared} className="rounded" />
            团队共享
          </label>
          <textarea
            name="promptBody"
            required
            rows={12}
            defaultValue={s.promptBody ?? ""}
            placeholder="方法论正文：步骤、输出结构、注意事项…"
            className={input}
          />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">保存</button>
      </form>
    </div>
  );
}
