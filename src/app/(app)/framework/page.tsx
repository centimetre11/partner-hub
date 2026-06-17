import { requireUser } from "@/lib/session";
import { PageHeader, Card } from "@/components/ui";
import { PartnerFrameworkMap } from "@/components/partner-framework-map";
import {
  ACTION_DOMAIN_LABELS,
  PARTNER_ARCHETYPE_LABELS,
  VALUE_PATTERN_LABELS,
  buildFrameworkReferenceMap,
} from "@/lib/partner-framework";
import { PIPELINE_STAGES } from "@/lib/constants";

export default async function FrameworkPage() {
  await requireUser();
  const refMap = buildFrameworkReferenceMap();

  return (
    <div className="pb-16">
      <PageHeader
        title="Partner operating framework"
        desc="Positioning → Playbook → Actions → Execution. Stage defines what to do; Tier defines intensity; type and value pattern define how."
      />

      <div className="px-8 space-y-6">
        <PartnerFrameworkMap
          nodes={refMap}
          title="Full map"
          subtitle="All partners share the same framework; open any partner detail page to see their instance map (current values + readiness)."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Positioning + Playbook layers">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold text-indigo-700">Positioning</dt>
                <dd className="text-zinc-600 mt-1">
                  <strong>Tier</strong> investment intensity · <strong>Stage</strong> relationship progress · <strong>Partner type</strong> action branch · <strong>Competitive DNA</strong> background
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-indigo-700">Playbook</dt>
                <dd className="text-zinc-600 mt-1">
                  <strong>Joint value pattern</strong> what we sell together · <strong>Value trio</strong> partner/FanRuan/customer · playbook + pitch
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-indigo-700">Actions (four domains)</dt>
                <dd className="text-zinc-600 mt-1">
                  {Object.values(ACTION_DOMAIN_LABELS).join(" · ")}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Partner type → action branch">
            <ul className="space-y-2 text-sm">
              {Object.entries(PARTNER_ARCHETYPE_LABELS).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="text-zinc-400 shrink-0 font-mono text-xs">{k}</span>
                  <span className="text-zinc-700">{v}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-400 mt-3">
              Pure channel / shell → stop advancing; general integrator → confirm dedicated data team first.
            </p>
          </Card>
        </div>

        <Card title="Joint value patterns">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(VALUE_PATTERN_LABELS).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                <div className="font-medium text-zinc-800">{v}</div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{k}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Stage 3 initial assessment · Stage 4 set pattern and demo · Stage 5 build solution instance · Stage 8 first deal validates pattern
          </p>
        </Card>

        <Card title="Pipeline ten stages · focus per stage">
          <div className="space-y-2">
            {PIPELINE_STAGES.map((s) => (
              <div key={s.stage} className="flex gap-3 text-sm py-2 border-b border-zinc-50 last:border-0">
                <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold">
                  {s.stage}
                </span>
                <div>
                  <div className="font-medium text-zinc-800">{s.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Tier intensity (frequency and resources only — does not change Stage)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                  <th className="pb-2 pr-4"> </th>
                  <th className="pb-2 pr-4">Tier A</th>
                  <th className="pb-2 pr-4">Tier B</th>
                  <th className="pb-2">Tier C</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700">
                {[
                  ["Touch frequency", "≤7 days", "≤14 days", "≤30 days"],
                  ["Meeting depth", "Meet decision maker", "Meet champion", "Async-first"],
                  ["POC / onsite", "Onsite available", "Standard support", "Self-serve materials"],
                  ["Certification target", "High (L3+)", "Medium (L2+)", "Low (L2)"],
                  ["Stall alert", "14 days", "21 days", "30 days"],
                ].map(([label, a, b, c]) => (
                  <tr key={label} className="border-b border-zinc-50">
                    <td className="py-2 pr-4 text-zinc-500">{label}</td>
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
