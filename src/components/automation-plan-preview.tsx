"use client";

import { useMemo } from "react";
import { describeCron } from "@/lib/cron";
import { buildAutomationPlanPreview } from "@/lib/automation-plan-preview";
import { getToolLabel } from "@/lib/tool-labels";
import { useLocale, useMessages } from "@/lib/i18n/context";

export function AutomationPlanPreview({
  description,
  partnerId,
  partnerName,
  wecomPushChatId,
  pushEmailTo,
  pushWecomAppTo,
  cronExpr,
}: {
  description: string;
  partnerId: string;
  partnerName?: string;
  wecomPushChatId: string;
  pushEmailTo: string;
  pushWecomAppTo: string;
  cronExpr: string;
}) {
  const a = useMessages().automations;
  const locale = useLocale();
  const lang = locale === "zh" ? "zh" : "en";

  const plan = useMemo(
    () =>
      buildAutomationPlanPreview({
        description,
        partnerId,
        partnerName,
        wecomPushChatId,
        pushEmailTo,
        pushWecomAppTo,
        locale: lang,
      }),
    [description, partnerId, partnerName, wecomPushChatId, pushEmailTo, pushWecomAppTo, lang]
  );

  const cronLabel = cronExpr.trim()
    ? describeCron(cronExpr, lang)
    : locale === "zh"
      ? "未设置"
      : "Not set";

  return (
    <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{a.planPreviewTitle}</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{a.planPreviewDesc}</p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white border border-violet-100/80 px-3 py-2">
          <dt className="text-slate-400">{a.planTemplate}</dt>
          <dd className="font-medium text-slate-800 mt-0.5">{plan.templateLabel}</dd>
        </div>
        <div className="rounded-lg bg-white border border-violet-100/80 px-3 py-2">
          <dt className="text-slate-400">{a.planScope}</dt>
          <dd className="font-medium text-slate-800 mt-0.5">{plan.partnerScope}</dd>
        </div>
        <div className="rounded-lg bg-white border border-violet-100/80 px-3 py-2">
          <dt className="text-slate-400">{a.planSchedule}</dt>
          <dd className="font-medium text-slate-800 mt-0.5">{cronLabel}</dd>
        </div>
        <div className="rounded-lg bg-white border border-violet-100/80 px-3 py-2">
          <dt className="text-slate-400">{a.planChannels}</dt>
          <dd className="font-medium text-slate-800 mt-0.5">{plan.channelsLabel}</dd>
        </div>
        {plan.dueWithinDays != null && (
          <div className="rounded-lg bg-white border border-violet-100/80 px-3 py-2 sm:col-span-2">
            <dt className="text-slate-400">{a.planDueDays}</dt>
            <dd className="font-medium text-slate-800 mt-0.5">
              {locale === "zh"
                ? `未来 ${plan.dueWithinDays} 个自然日（含今天）`
                : `${plan.dueWithinDays} calendar days from today`}
            </dd>
          </div>
        )}
      </dl>

      <div>
        <div className="text-xs font-semibold text-slate-700 mb-1.5">{a.planSteps}</div>
        <ol className="list-decimal list-inside text-xs text-slate-600 space-y-1 leading-relaxed">
          {plan.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      {plan.runtimeSkills.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-1.5">{a.runtimeTools}</div>
          <div className="flex flex-wrap gap-1.5">
            {plan.runtimeSkills.map((tool) => (
              <span
                key={tool}
                className="rounded-md border border-violet-100 bg-white px-2 py-0.5 text-[11px] text-violet-900 font-mono"
                title={tool}
              >
                {getToolLabel(tool, locale)} · {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-violet-700 font-medium">{a.planViewTaskMd}</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950 text-slate-100 p-3 text-[11px] leading-relaxed max-h-64 overflow-y-auto">
          {plan.taskMd}
        </pre>
      </details>
    </section>
  );
}
