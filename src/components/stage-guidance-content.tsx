import type { StageGuidance } from "@/lib/partner-framework";
import type { LabelsBundle } from "@/lib/i18n/labels";
import type { Messages } from "@/lib/i18n/messages/en";

export function StageGuidanceContent({
  guidance,
  labels,
  messages: m,
  variant = "light",
}: {
  guidance: StageGuidance;
  labels: LabelsBundle;
  messages: Messages;
  variant?: "light" | "dark";
}) {
  const passed = guidance.exitChecks.filter((c) => c.ok).length;
  const total = guidance.exitChecks.length;
  const isDark = variant === "dark";

  const textMain = isDark ? "text-slate-200" : "text-slate-600";
  const textMuted = isDark ? "text-slate-400" : "text-slate-400";
  const textLabel = isDark ? "text-slate-400" : "text-slate-700";
  const domainBg = isDark ? "bg-white/10 border-white/10" : "bg-slate-50/50 border-slate-100";
  const domainTitle = isDark ? "text-slate-400" : "text-sky-700";
  const borderTop = isDark ? "border-white/10" : "border-slate-100";

  return (
    <div>
      <p className={`text-xs mb-3 ${textMain}`}>{guidance.focus}</p>

      <details className="mb-3">
        <summary className={`text-xs cursor-pointer list-none ${textLabel}`}>
          {m.partnerDetail.stageDomainActions}
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          {Object.entries(guidance.domains).map(([key, actions]) => (
            <div key={key} className={`rounded-lg border p-2.5 ${domainBg}`}>
              <div className={`text-xs font-semibold mb-1.5 ${domainTitle}`}>
                {labels.actionDomainLabels[key] ?? key}
              </div>
              <ul className="space-y-1">
                {actions.map((a) => (
                  <li key={a} className={`text-xs flex gap-1.5 ${textMain}`}>
                    <span className={`shrink-0 ${textMuted}`}>→</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      <div className={`border-t pt-3 ${borderTop}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-medium ${textLabel}`}>
            {m.partnerDetail.stageExit.replace("{passed}", String(passed)).replace("{total}", String(total))}
          </span>
          {passed === total && total > 0 && (
            <span className={`text-xs font-medium ${isDark ? "text-emerald-300" : "text-emerald-600"}`}>
              {m.partnerDetail.readyToAdvance}
            </span>
          )}
        </div>
        <ul className="space-y-1.5">
          {guidance.exitChecks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span className={c.ok ? (isDark ? "text-emerald-300" : "text-emerald-500") : textMuted}>
                {c.ok ? "✓" : "○"}
              </span>
              <span className={c.ok ? textMain : textMuted}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
