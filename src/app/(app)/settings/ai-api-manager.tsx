"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import {
  deleteAiApiAction,
  setDefaultAiApiAction,
  toggleAiApiAction,
  upsertAiApiAction,
  type AiApiActionState,
} from "@/lib/ai-settings-actions";
import { VolcengineApiSetup, type VolcengineApiForClient } from "./volcengine-api-setup";
import { LeadResearchSetup } from "./lead-research-setup";
import { ModelSceneChips } from "./model-scene-chips";
import { buildLeadResearchVolcengineSnippet } from "@/lib/volcengine-config";
import type { AiCapability } from "@/lib/ai-capabilities";
import { useMessages } from "@/lib/i18n/context";

export type AiApiConfigForClient = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  keyTail: string;
  capabilities: AiCapability[];
  dailyTokenLimit: number | null;
  usedTodayTokens: number;
  priority: number;
  assignedScenes: string[];
  createdAt: string;
};

function fmtNum(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
const label = "text-xs font-medium text-slate-500";

function StateMessage({ state }: { state: AiApiActionState }) {
  if (state?.error) return <p className="text-xs text-red-600">{state.error}</p>;
  if (state?.ok) return <p className="text-xs text-emerald-600">{state.message ?? "Saved"}</p>;
  return null;
}

function ApiEditForm({
  api,
  onCancel,
  submitText,
}: {
  api?: AiApiConfigForClient;
  onCancel: () => void;
  submitText: string;
}) {
  const [state, action, pending] = useActionState(upsertAiApiAction, null);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{api ? "Edit API" : "Add API"}</div>
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800">
          Cancel
        </button>
      </div>
      <form action={action} className="space-y-3">
        {api && <input type="hidden" name="id" value={api.id} />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>Name</span>
            <input name="name" required defaultValue={api?.name ?? ""} placeholder="Kimi production API" className={input} />
          </label>
          <label className="space-y-1">
            <span className={label}>Model</span>
            <input name="model" required defaultValue={api?.model ?? ""} placeholder="kimi-k2-0711-preview" className={input} />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className={label}>Base URL</span>
          <input name="baseUrl" required defaultValue={api?.baseUrl ?? ""} placeholder="https://api.moonshot.cn/v1" className={input} />
        </label>
        <label className="space-y-1 block">
          <span className={label}>API Key{api ? ` (current tail ${api.keyTail}; leave blank to keep)` : ""}</span>
          <input name="apiKey" type="password" required={!api} placeholder={api ? "Leave blank to keep existing key" : "sk-..."} className={input} autoComplete="off" />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className={label}>Priority (higher numbers are tried first; default 0)</span>
            <input
              name="priority"
              type="number"
              defaultValue={api?.priority ?? 0}
              placeholder="Use a higher value for free-tier quotas to use them first"
              className={input}
            />
          </label>
          <label className="space-y-1 block">
            <span className={label}>Daily token limit (optional; blank = unlimited)</span>
            <input
              name="dailyTokenLimit"
              type="number"
              min={0}
              defaultValue={api?.dailyTokenLimit ?? ""}
              placeholder="e.g. 1000000; auto-switch when exceeded"
              className={input}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <label className="inline-flex items-center gap-1.5">
            <input name="enabled" type="checkbox" defaultChecked={api?.enabled ?? true} className="rounded border-slate-300" />
            Enabled
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input name="isDefault" type="checkbox" defaultChecked={api?.isDefault ?? false} className="rounded border-slate-300" />
            Set as default
          </label>
        </div>
        <StateMessage state={state} />
        <button disabled={pending} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50">
          {pending ? "Saving..." : submitText}
        </button>
      </form>
    </div>
  );
}

function ApiConfigCard({ api, onEdit }: { api: AiApiConfigForClient; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const limitReached = !!api.dailyTokenLimit && api.usedTodayTokens >= api.dailyTokenLimit;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 rounded-lg"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path fillRule="evenodd" d="M7.21 5.23a.75.75 0 011.06.02l4 4.25a.75.75 0 010 1.04l-4 4.25a.75.75 0 11-1.08-1.04L10.69 10 7.23 6.29a.75.75 0 01-.02-1.06z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold text-slate-900 truncate">{api.name}</span>
        {api.isDefault && <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 shrink-0">Default</span>}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${api.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {api.enabled ? "Enabled" : "Disabled"}
        </span>
        {api.priority !== 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 shrink-0">Priority {api.priority}</span>
        )}
        {limitReached && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 shrink-0">Limit reached</span>
        )}
        <span className="ml-auto font-mono text-[11px] text-slate-400 truncate shrink-0">{api.model}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <dl className="space-y-1 text-xs">
                <div><span className="text-slate-400">Model </span><span className="font-mono text-slate-700">{api.model}</span></div>
                <div><span className="text-slate-400">Base URL </span><span className="font-mono text-slate-700 break-all">{api.baseUrl}</span></div>
                <div><span className="text-slate-400">Key tail </span><span className="font-mono text-slate-700">{api.keyTail}</span></div>
                <div>
                  <span className="text-slate-400">Daily limit </span>
                  {api.dailyTokenLimit ? (
                    <span className={`font-mono ${limitReached ? "text-red-600" : "text-slate-700"}`}>
                      Today {fmtNum(api.usedTodayTokens)} / {fmtNum(api.dailyTokenLimit)} tokens
                      {limitReached ? " (limit reached; switched today)" : ""}
                    </span>
                  ) : (
                    <span className="font-mono text-slate-400">Unlimited</span>
                  )}
                </div>
              </dl>
              <ModelSceneChips modelId={api.id} assignedScenes={api.assignedScenes} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-sky-600"
              >
                Edit
              </button>
              {!api.isDefault && (
                <form action={setDefaultAiApiAction.bind(null, api.id)}>
                  <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-sky-600">
                    Set default
                  </button>
                </form>
              )}
              <form action={toggleAiApiAction.bind(null, api.id, !api.enabled)}>
                <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-sky-600">
                  {api.enabled ? "Disable" : "Enable"}
                </button>
              </form>
              <form action={deleteAiApiAction.bind(null, api.id)}>
                <button className="rounded-md border border-red-100 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AiApiManager({
  apis,
  volcengineApis,
  leadResearchSceneModels = [],
}: {
  apis: AiApiConfigForClient[];
  volcengineApis: VolcengineApiForClient[];
  leadResearchSceneModels?: { name: string; model: string }[];
}) {
  const lr = useMessages().settings.leadResearch;
  const genericApis = apis.filter((api) => api.provider !== "volcengine");
  const [genericPanel, setGenericPanel] = useState<"list" | "add" | string>("list");
  const [volcPanel, setVolcPanel] = useState<string>("list");

  const leadResearchPreset = useMemo(
    () => ({
      name: lr.presetName,
      formTitle: lr.addVolcFormTitle,
      submitText: lr.addVolcSubmit,
      priority: 10,
      snippet: buildLeadResearchVolcengineSnippet(),
    }),
    [lr.addVolcFormTitle, lr.addVolcSubmit, lr.presetName],
  );

  const closeVolcPanel = () => {
    setVolcPanel("list");
  };

  return (
    <div className="space-y-8">
      <LeadResearchSetup
        apis={apis}
        volcengineApis={volcengineApis}
        sceneModels={leadResearchSceneModels}
        showPresetForm={volcPanel === "lead-research-add"}
        onAddVolcenginePreset={() => {
          setVolcPanel("lead-research-add");
        }}
      />

      <VolcengineApiSetup
        configs={volcengineApis}
        panel={volcPanel}
        onPanelChange={(p) => {
          if (p === "list") closeVolcPanel();
          else setVolcPanel(p);
        }}
        leadResearchPreset={leadResearchPreset}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">Other OpenAI-compatible APIs</div>
            <div className="text-xs text-slate-400 mt-1">Kimi, DeepSeek, Tongyi, and other Chat Completions endpoints</div>
          </div>
          {genericPanel === "list" && volcPanel === "list" && (
            <button
              type="button"
              onClick={() => setGenericPanel("add")}
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700 shrink-0"
            >
              + Add API
          </button>
          )}
        </div>

        {genericPanel === "add" && (
          <ApiEditForm onCancel={() => setGenericPanel("list")} submitText="Add API" />
        )}

        <div className="space-y-3">
          {genericApis.map((api) =>
            genericPanel === api.id ? (
              <ApiEditForm key={api.id} api={api} onCancel={() => setGenericPanel("list")} submitText="Save changes" />
            ) : (
              <ApiConfigCard key={api.id} api={api} onEdit={() => setGenericPanel(api.id)} />
            )
          )}
          {genericApis.length === 0 && genericPanel !== "add" && (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              No other API configurations yet. Until you add one, AI_API_KEY in `.env` remains the compatibility fallback.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
