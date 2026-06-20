import Link from "next/link";
import { Card, EmptyState, fmtDateTime } from "@/components/ui";
import { clonePartnerAgentAction } from "@/lib/agent-actions";
import { RunButton } from "@/app/(app)/agents/[id]/run-button";
import type { Messages } from "@/lib/i18n/messages/en";

type AgentRow = {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  enabled: boolean;
  lastRunAt: Date | null;
};

type TemplateRow = {
  id: string;
  name: string;
  icon: string;
  description: string | null;
};

export function PartnerAgentsPanel({
  partnerId,
  agents,
  templates,
  copy,
  bcp47,
}: {
  partnerId: string;
  agents: AgentRow[];
  templates: TemplateRow[];
  copy: Messages["partnerDetail"]["agentsPanel"];
  bcp47: string;
}) {
  return (
    <Card title={copy.title.replace("{count}", String(agents.length))}>
      <p className="text-xs text-slate-500 mb-4">{copy.desc}</p>
      <div className="space-y-3">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
            <div className="min-w-0">
              <Link href={`/agents/${a.id}`} className="text-sm font-medium text-slate-900 hover:text-sky-600">
                {a.icon} {a.name}
              </Link>
              {a.description && <p className="text-xs text-slate-400 truncate">{a.description}</p>}
              {a.lastRunAt && (
                <p className="text-xs text-slate-400">
                  {copy.lastRun.replace("{date}", fmtDateTime(a.lastRunAt, bcp47))}
                </p>
              )}
            </div>
            <RunButton agentId={a.id} compact />
          </div>
        ))}
        {agents.length === 0 && <EmptyState text={copy.noAgents} />}
      </div>

      {templates.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-500 mb-2">{copy.templatesHint}</div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <form key={t.id} action={clonePartnerAgentAction.bind(null, t.id, partnerId)}>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-300 hover:text-sky-600">
                  {t.icon} {t.name}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <Link href={`/agents/new?partnerId=${partnerId}`} className="mt-4 text-sm text-sky-600 hover:underline block">
        {copy.customAgent}
      </Link>
    </Card>
  );
}
