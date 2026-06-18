import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { requireUser } from "@/lib/session";
import { upsertSkillAction } from "@/lib/content-actions";
import { getServerI18n } from "@/lib/server-i18n";

export default async function NewSkillPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title={m.skills.newTitle} desc={m.skills.newDesc} />
      <AiCenterNav />
      <form action={upsertSkillAction} className="px-8 max-w-3xl space-y-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="name" required placeholder={m.skills.identifier} className={input} />
          <input name="label" required placeholder={m.skills.displayName} className={input} />
          <input name="description" placeholder={m.skills.oneLineDesc} className={input} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked className="rounded" />
            {m.common.shareWithTeam}
          </label>
          <textarea
            name="promptBody"
            required
            rows={12}
            placeholder={m.skills.promptBody}
            className={input}
          />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">{m.common.save}</button>
      </form>
    </div>
  );
}
