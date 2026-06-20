import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { upsertSkillAction } from "@/lib/content-actions";
import { getServerI18n } from "@/lib/server-i18n";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { messages: m } = await getServerI18n();
  const { id } = await params;
  const s = await db.skill.findUnique({ where: { id } });
  if (!s || s.isBuiltin) notFound();
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="pb-16">
      <PageHeader title={m.skills.editTitle.replace("{label}", s.label)} desc={m.skills.editDesc} />
      <AiCenterNav />
      <form action={upsertSkillAction} className="px-8 max-w-3xl space-y-4">
        <input type="hidden" name="id" value={s.id} />
        <div className="bg-white rounded-lg border p-5 space-y-3">
          <input name="name" required defaultValue={s.name} placeholder={m.skills.identifierShort} className={input} />
          <input name="label" required defaultValue={s.label} placeholder={m.skills.displayName} className={input} />
          <input name="description" defaultValue={s.description ?? ""} placeholder={m.skills.oneLineDesc} className={input} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked={s.shared} className="rounded" />
            {m.common.shareWithTeam}
          </label>
          <textarea
            name="promptBody"
            required
            rows={12}
            defaultValue={s.promptBody ?? ""}
            placeholder={m.skills.methodologyBody}
            className={input}
          />
        </div>
        <button className="rounded-lg bg-slate-900 text-white px-6 py-2.5 text-sm">{m.common.save}</button>
      </form>
    </div>
  );
}
