import { requireUser } from "@/lib/session";
import { PageHeader, Card } from "@/components/ui";
import { PartnerFrameworkMap } from "@/components/partner-framework-map";
import { buildFrameworkReferenceMap } from "@/lib/partner-framework";
import { getServerI18n } from "@/lib/server-i18n";

export default async function FrameworkPage() {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const refMap = buildFrameworkReferenceMap(labels);

  const tierRows = [
    [m.framework.touchFrequency, m.framework.tierA_touch, m.framework.tierB_touch, m.framework.tierC_touch],
    [m.framework.meetingDepth, m.framework.tierA_meeting, m.framework.tierB_meeting, m.framework.tierC_meeting],
    [m.framework.pocOnsite, m.framework.tierA_poc, m.framework.tierB_poc, m.framework.tierC_poc],
    [m.framework.certTarget, m.framework.tierA_cert, m.framework.tierB_cert, m.framework.tierC_cert],
    [m.framework.stallAlert, m.framework.tierA_stall, m.framework.tierB_stall, m.framework.tierC_stall],
  ] as const;

  return (
    <div className="pb-16">
      <PageHeader title={m.framework.title} desc={m.framework.desc} />

      <div className="px-8 space-y-6">
        <PartnerFrameworkMap
          nodes={refMap}
          title={m.framework.fullMap}
          subtitle={m.framework.fullMapSubtitle}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title={m.framework.positioningPlaybook}>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold text-sky-700">{m.framework.positioning}</dt>
                <dd className="text-slate-600 mt-1">{m.framework.positioningDesc}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-sky-700">{m.framework.playbook}</dt>
                <dd className="text-slate-600 mt-1">{m.framework.playbookDesc}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-sky-700">{m.framework.actions}</dt>
                <dd className="text-slate-600 mt-1">
                  {Object.values(labels.actionDomainLabels).join(" · ")}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title={m.framework.archetypeBranch}>
            <ul className="space-y-2 text-sm">
              {Object.entries(labels.partnerArchetypeLabels).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="text-slate-400 shrink-0 font-mono text-xs">{k}</span>
                  <span className="text-slate-700">{v}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400 mt-3">{m.framework.archetypeNote}</p>
          </Card>
        </div>

        <Card title={m.framework.valuePatterns}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(labels.valuePatternLabels).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="font-medium text-slate-800">{v}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{k}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-4">{m.framework.valuePatternsNote}</p>
        </Card>

        <Card title={m.framework.pipelineStages}>
          <div className="space-y-2">
            {labels.pipelineStages.map((s) => (
              <div key={s.stage} className="flex gap-3 text-sm py-2 border-b border-slate-50 last:border-0">
                <span className="shrink-0 w-8 h-8 rounded-full bg-slate-50 text-sky-700 flex items-center justify-center text-xs font-bold">
                  {s.stage}
                </span>
                <div>
                  <div className="font-medium text-slate-800">{s.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={m.framework.tierIntensity}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 pr-4"> </th>
                  <th className="pb-2 pr-4">{m.framework.tierA}</th>
                  <th className="pb-2 pr-4">{m.framework.tierB}</th>
                  <th className="pb-2">{m.framework.tierC}</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {tierRows.map(([label, a, b, c]) => (
                  <tr key={label} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-500">{label}</td>
                    <td className="py-2 pr-4">{a}</td>
                    <td className="py-2 pr-4">{b}</td>
                    <td className="py-2">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
