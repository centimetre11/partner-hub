import Link from "next/link";
import { Card, EmptyState, fmtDateTime } from "@/components/ui";
import { clonePartnerAgentAction } from "@/lib/agent-actions";
import { RunButton } from "@/app/(app)/agents/[id]/run-button";

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
}: {
  partnerId: string;
  agents: AgentRow[];
  templates: TemplateRow[];
}) {
  return (
    <Card title={`快捷 Agent（${agents.length}）`}>
      <p className="text-xs text-zinc-500 mb-4">
        绑定本伙伴的自动化助手：会前简报、动态监测、联合方案报告等
      </p>
      <div className="space-y-3">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2.5">
            <div className="min-w-0">
              <Link href={`/agents/${a.id}`} className="text-sm font-medium text-zinc-900 hover:text-indigo-600">
                {a.icon} {a.name}
              </Link>
              {a.description && <p className="text-xs text-zinc-400 truncate">{a.description}</p>}
              {a.lastRunAt && (
                <p className="text-xs text-zinc-400">上次运行 {fmtDateTime(a.lastRunAt)}</p>
              )}
            </div>
            <RunButton agentId={a.id} compact />
          </div>
        ))}
        {agents.length === 0 && <EmptyState text="暂无绑定 Agent" />}
      </div>

      {templates.length > 0 && (
        <div className="mt-5 pt-4 border-t border-zinc-100">
          <div className="text-xs text-zinc-500 mb-2">从模板快速创建（绑定本伙伴）</div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <form key={t.id} action={clonePartnerAgentAction.bind(null, t.id, partnerId)}>
                <button className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:border-indigo-300 hover:text-indigo-600">
                  {t.icon} {t.name}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <Link href={`/agents/new?partnerId=${partnerId}`} className="mt-4 text-sm text-indigo-600 hover:underline block">
        + 自定义 Agent
      </Link>
    </Card>
  );
}
