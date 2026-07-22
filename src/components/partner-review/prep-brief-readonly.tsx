"use client";

import type { PartnerPrepBrief } from "@/lib/partner-review/types";
import { categoryLabel, tidyProgressText } from "@/lib/partner-review/brief-text";
import { MossPrepCustomerBadge } from "@/components/moss/moss-workflow-sections";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";
import { useLocale } from "@/lib/i18n/context";
import { localeToBcp47 } from "@/lib/i18n/locale";

function tidyClientText(text: string): string {
  return tidyProgressText(text, 360);
}

export function PrepBriefReadonly({
  brief,
  compact = false,
  mossConfigured = true,
}: {
  brief: PartnerPrepBrief;
  compact?: boolean;
  mossConfigured?: boolean;
}) {
  const t = useMessages().partnerReview;
  const locale = useLocale();
  const catLabel: Record<string, string> = {
    VISIT: t.catVisit,
    TRAINING: t.catTraining,
    NEGOTIATION: t.catNegotiation,
    DELIVERY: t.catDelivery,
    RELATIONSHIP: t.catRelationship,
    OTHER: t.catOther,
  };

  const todos = brief.todos?.length
    ? brief.todos
    : (brief.openTodos ?? []).map((todo) => ({ ...todo, done: false }));
  const openCount = todos.filter((todo) => !todo.done).length;
  const activeOppCount = brief.customerOpportunities?.reduce(
    (n, g) => n + g.opportunities.length,
    0,
  ) ?? 0;

  return (
    <div className="space-y-4 text-sm">
      {brief.summaryLine ? (
        <p className="text-slate-700 leading-relaxed">{brief.summaryLine}</p>
      ) : null}

      {brief.aiTopics.length ? (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">{t.topics}</div>
          <ul className="list-disc pl-5 space-y-1 text-slate-700">
            {brief.aiTopics.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.customerOpportunities?.length ? (
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-2">
            {t.customerOpportunities}
            <span className="font-normal text-slate-400">
              {" "}
              · {formatMsg(t.activeCount, { n: activeOppCount })}
            </span>
          </div>
          <div className="space-y-3">
            {brief.customerOpportunities.map((group) => (
              <div
                key={group.customerId}
                className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{group.customerName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {group.customerId !== "__unassigned__" ? (
                      <MossPrepCustomerBadge
                        customerId={group.customerId}
                        customerName={group.customerName}
                        creditCode={group.creditCode}
                        mossFitLevel={group.mossFitLevel}
                        mossSyncedAt={group.mossSyncedAt}
                        configured={mossConfigured}
                      />
                    ) : null}
                    <span className="text-[11px] text-slate-500">
                      {formatMsg(t.opportunityCount, { n: group.opportunities.length })}
                    </span>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {group.opportunities.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm rounded-md bg-white/80 border border-violet-50 px-2.5 py-1.5"
                    >
                      <span className="font-medium text-slate-800">{o.name}</span>
                      <span className="text-[11px] text-violet-700">{o.statusLabel}</span>
                      {o.stage ? <span className="text-[11px] text-slate-500">{o.stage}</span> : null}
                      {o.amount ? (
                        <span className="text-[11px] text-slate-600 font-mono">{o.amount}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!compact && todos.length ? (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">
            {t.todoExcerpt}
            <span className="font-normal text-slate-400">
              {" "}
              · {formatMsg(t.openCount, { n: openCount })}
            </span>
          </div>
          <ul className="space-y-1.5">
            {todos.slice(0, 10).map((todo) => (
              <li
                key={todo.id}
                className={`text-sm ${todo.done ? "text-slate-400 line-through" : "text-slate-800"}`}
              >
                {todo.title}
                {!todo.done && todo.overdue ? (
                  <span className="ml-1.5 text-[11px] text-red-600">{t.overdue}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact && brief.progress.length ? (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">{t.recentProgress}</div>
          <ul className="space-y-2.5">
            {brief.progress.slice(0, compact ? 4 : 8).map((p, i) => {
              const label =
                p.categoryLabel || catLabel[p.category] || categoryLabel(p.category);
              const body = tidyClientText(p.contentPreview || "");
              const dateLabel = p.occurredAt
                ? new Date(p.occurredAt).toLocaleDateString(localeToBcp47(locale), {
                    month: "numeric",
                    day: "numeric",
                  })
                : "";
              return (
                <li
                  key={`${p.title}-${i}`}
                  className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-white text-slate-600 border border-slate-200">
                      {label}
                    </span>
                    {dateLabel ? <span className="text-[11px] text-slate-400">{dateLabel}</span> : null}
                  </div>
                  <div className="text-sm font-medium text-slate-900 leading-snug">{p.title}</div>
                  {body && body !== p.title ? (
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{body}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
