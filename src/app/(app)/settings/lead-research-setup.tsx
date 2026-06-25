"use client";

import { Badge } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";
import type { AiApiConfigForClient } from "./ai-api-manager";
import type { VolcengineApiForClient } from "./volcengine-api-setup";
import { LEAD_RESEARCH_PRESET_CAPABILITIES } from "@/lib/ai-capabilities";

type Props = {
  apis: AiApiConfigForClient[];
  volcengineApis: VolcengineApiForClient[];
  onAddPreset: () => void;
  showPresetForm: boolean;
};

function hasWebSearch(apis: AiApiConfigForClient[], volcengineApis: VolcengineApiForClient[]): boolean {
  const kimi = apis.some((a) => a.enabled && a.baseUrl.toLowerCase().includes("moonshot"));
  const volc = volcengineApis.some((a) => {
    if (!a.enabled) return false;
    const tools = a.extraConfig?.tools;
    return Array.isArray(tools) && tools.some((t) => t && typeof t === "object" && (t as { type?: string }).type === "web_search");
  });
  return kimi || volc;
}

function synthesisModels(apis: AiApiConfigForClient[]): AiApiConfigForClient[] {
  return apis.filter((a) => a.enabled && a.capabilities.includes("lead_research"));
}

export function LeadResearchSetup({ apis, volcengineApis, onAddPreset, showPresetForm }: Props) {
  const s = useMessages().settings.leadResearch;
  const webOk = hasWebSearch(apis, volcengineApis);
  const synthModels = synthesisModels(apis);
  const ready = webOk && synthModels.length > 0;

  return (
    <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{s.title}</h3>
            <Badge tone={ready ? "green" : "amber"}>{ready ? s.ready : s.notReady}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
        </div>
        {!showPresetForm && synthModels.length === 0 && (
          <button
            type="button"
            onClick={onAddPreset}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700"
          >
            {s.addModel}
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <div className="rounded-lg border border-white/80 bg-white/70 px-3 py-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-slate-700">{s.webSearch}</span>
            <Badge tone={webOk ? "green" : "amber"}>{webOk ? s.configured : s.notConfigured}</Badge>
          </div>
          <p className="text-slate-400">{s.webSearchHint}</p>
        </div>
        <div className="rounded-lg border border-white/80 bg-white/70 px-3 py-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-slate-700">{s.synthesis}</span>
            <Badge tone={synthModels.length ? "green" : "amber"}>
              {synthModels.length ? s.configured : s.notConfigured}
            </Badge>
          </div>
          <p className="text-slate-400">{s.synthesisHint}</p>
          {synthModels.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-slate-600">
              {synthModels.map((m) => (
                <li key={m.id} className="font-mono text-[11px]">
                  {m.name} · {m.model}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export const LEAD_RESEARCH_FORM_DEFAULTS = {
  nameKey: "presetName" as const,
  model: "moonshot-v1-8k",
  baseUrl: "https://api.moonshot.cn/v1",
  priority: 10,
  capabilities: LEAD_RESEARCH_PRESET_CAPABILITIES,
};
