import { Card } from "@/components/ui";
import {
  getStageGuidance,
  type PartnerFrameworkInput,
} from "@/lib/partner-framework";
import type { LabelsBundle } from "@/lib/i18n/labels";
import type { Messages } from "@/lib/i18n/messages/en";

export function PartnerStageGuidancePanel({
  partner,
  labels,
  messages: m,
}: {
  partner: PartnerFrameworkInput;
  labels: LabelsBundle;
  messages: Messages;
}) {
  const guidance = getStageGuidance(partner, labels);
  const passed = guidance.exitChecks.filter((c) => c.ok).length;
  const total = guidance.exitChecks.length;
  const title = m.partnerDetail.stageGuidanceTitle
    .replace("{stage}", String(guidance.stage))
    .replace("{name}", guidance.name);

  return (
    <Card title={title}>
      <p className="text-sm text-zinc-600 mb-4">{guidance.focus}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {Object.entries(guidance.domains).map(([key, actions]) => (
          <div key={key} className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
            <div className="text-xs font-semibold text-indigo-700 mb-2">
              {labels.actionDomainLabels[key] ?? key}
            </div>
            <ul className="space-y-1">
              {actions.map((a) => (
                <li key={a} className="text-xs text-zinc-600 flex gap-1.5">
                  <span className="text-zinc-300 shrink-0">→</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-700">
            {m.partnerDetail.stageExit.replace("{passed}", String(passed)).replace("{total}", String(total))}
          </span>
          {passed === total && total > 0 && (
            <span className="text-xs text-emerald-600 font-medium">{m.partnerDetail.readyToAdvance}</span>
          )}
        </div>
        <ul className="space-y-1.5">
          {guidance.exitChecks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <span className={c.ok ? "text-emerald-500" : "text-zinc-300"}>{c.ok ? "✓" : "○"}</span>
              <span className={c.ok ? "text-zinc-700" : "text-zinc-400"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
