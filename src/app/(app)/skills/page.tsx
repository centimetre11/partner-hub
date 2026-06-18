import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { deleteSkillAction, cloneSkillAction } from "@/lib/content-actions";
import { getServerI18n } from "@/lib/server-i18n";

export default async function SkillsPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();
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
        title={m.skills.title}
        desc={m.skills.desc}
        actions={
          <Link href="/skills/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            {m.skills.newSkill}
          </Link>
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-4xl space-y-4">
        <div className="rounded-xl border border-purple-100 bg-purple-50/40 px-4 py-3 text-sm text-purple-900/80">
          <span className="font-medium">{m.skills.howEffective}</span>{" "}
          {m.skills.howEffectiveBody}
        </div>

        {skills.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200/80 p-8 text-center">
            <div className="text-2xl mb-2">⚡</div>
            <div className="text-sm font-medium text-zinc-800">{m.skills.empty}</div>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">{m.skills.emptyDesc}</p>
            <Link href="/skills/new" className="inline-block mt-4 text-sm text-indigo-600 hover:underline">
              {m.skills.createFirst}
            </Link>
          </div>
        ) : (
          <>
            <div className="text-xs text-zinc-400">{m.skills.equipCount.replace("{skills}", String(skills.length)).replace("{agents}", String(equippedCount))}</div>
            <div className="space-y-3">
              {skills.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border p-5 flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/skills/${s.id}`} className="font-semibold text-zinc-900 hover:text-indigo-600">
                        {s.label}
                      </Link>
                      <Badge tone="purple">{m.skills.methodology}</Badge>
                      {s.shared && <Badge tone="zinc">{m.skills.shared}</Badge>}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 font-mono">{s.name}</div>
                    {s.description && <p className="text-sm text-zinc-500 mt-2">{s.description}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <form action={cloneSkillAction.bind(null, s.id)}>
                      <button className="text-xs text-zinc-400 hover:text-indigo-600">{m.common.clone}</button>
                    </form>
                    <form action={deleteSkillAction.bind(null, s.id)}>
                      <button className="text-xs text-zinc-400 hover:text-red-600">{m.common.delete}</button>
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
