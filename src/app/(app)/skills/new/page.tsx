import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { requireUser } from "@/lib/session";
import { upsertSkillAction } from "@/lib/content-actions";

export default async function NewSkillPage() {
  await requireUser();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title="New Skill" desc="Write methodology flows—injected into Agent system instructions at runtime to guide how tools are combined" />
      <AiCenterNav />
      <form action={upsertSkillAction} className="px-8 max-w-3xl space-y-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="name" required placeholder="Identifier (English, e.g. joint_solution_outline)" className={input} />
          <input name="label" required placeholder="Display name *" className={input} />
          <input name="description" placeholder="One-line description" className={input} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked className="rounded" />
            Share with team
          </label>
          <textarea
            name="promptBody"
            required
            rows={12}
            placeholder="Prompt body: tell the Agent how to think in a specific scenario and what structure to output…"
            className={input}
          />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">Save</button>
      </form>
    </div>
  );
}
