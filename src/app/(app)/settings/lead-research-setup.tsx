"use client";

import { Badge } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";
import type { AiApiConfigForClient } from "./ai-api-manager";
import type { VolcengineApiForClient } from "./volcengine-api-setup";

type Props = {
  apis: AiApiConfigForClient[];
  volcengineApis: VolcengineApiForClient[];
  showPresetForm: boolean;
  onAddVolcenginePreset: () => void;
  /** 「线索研究」场景已分配的模型（来自场景分配，新机制） */
  sceneModels?: { name: string; model: string }[];
};

function volcHasWebSearch(cfg: VolcengineApiForClient): boolean {
  const tools = cfg.extraConfig?.tools;
  return Array.isArray(tools) && tools.some((t) => t && typeof t === "object" && (t as { type?: string }).type === "web_search");
}

function hasWebSearch(apis: AiApiConfigForClient[], volcengineApis: VolcengineApiForClient[]): boolean {
  if (volcengineApis.some((a) => a.enabled && volcHasWebSearch(a))) return true;
  return apis.some((a) => a.enabled && a.baseUrl.toLowerCase().includes("moonshot"));
}

export function LeadResearchSetup({
  apis,
  volcengineApis,
  showPresetForm,
  onAddVolcenginePreset,
  sceneModels = [],
}: Props) {
  const s = useMessages().settings.leadResearch;
  const webOk = hasWebSearch(apis, volcengineApis);
  // 整理模型以「线索研究」场景里分配的模型为准（在下方「场景模型分配」里配置）
  const synthModels = sceneModels;
  const ready = webOk && synthModels.length > 0;

  return (
    <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{s.title}</h3>
            <Badge tone={ready ? "green" : "amber"}>{ready ? s.ready : s.notReady}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!showPresetForm && (
            <button
              type="button"
              onClick={onAddVolcenginePreset}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs text-white hover:bg-orange-500"
            >
              {s.addVolcModel}
            </button>
          )}
        </div>
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
              {synthModels.map((m, i) => (
                <li key={`${m.name}-${m.model}-${i}`} className="font-mono text-[11px]">
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
