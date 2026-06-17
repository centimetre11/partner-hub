"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  deleteAiApiAction,
  setDefaultAiApiAction,
  toggleAiApiAction,
  upsertAiApiAction,
  type AiApiActionState,
} from "@/lib/ai-settings-actions";
import { VolcengineApiSetup, type VolcengineApiForClient } from "./volcengine-api-setup";
import { AiCapabilityBadges, AiCapabilityFields } from "./ai-capability-fields";
import type { AiCapability } from "@/lib/ai-capabilities";

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
  createdAt: string;
};

function fmtNum(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const label = "text-xs font-medium text-zinc-500";

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
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-900">{api ? "Edit API" : "Add API"}</div>
        <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-800">
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
        <AiCapabilityFields defaultCapabilities={api?.capabilities} />
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
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
          <label className="inline-flex items-center gap-1.5">
            <input name="enabled" type="checkbox" defaultChecked={api?.enabled ?? true} className="rounded border-zinc-300" />
            Enabled
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input name="isDefault" type="checkbox" defaultChecked={api?.isDefault ?? false} className="rounded border-zinc-300" />
            Set as default
          </label>
        </div>
        <StateMessage state={state} />
        <button disabled={pending} className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50">
          {pending ? "Saving..." : submitText}
        </button>
      </form>
    </div>
  );
}

function ApiConfigCard({ api, onEdit }: { api: AiApiConfigForClient; onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900">{api.name}</span>
            {api.isDefault && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Default</span>}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${api.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
              {api.enabled ? "Enabled" : "Disabled"}
            </span>
            {api.priority !== 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Priority {api.priority}</span>
            )}
          </div>
          <dl className="mt-2 space-y-1 text-xs">
            <div><span className="text-zinc-400">Model </span><span className="font-mono text-zinc-700">{api.model}</span></div>
            <div><span className="text-zinc-400">Base URL </span><span className="font-mono text-zinc-700 break-all">{api.baseUrl}</span></div>
            <div><span className="text-zinc-400">Key tail </span><span className="font-mono text-zinc-700">{api.keyTail}</span></div>
            <div>
              <span className="text-zinc-400">Daily limit </span>
              {api.dailyTokenLimit ? (
                <span className={`font-mono ${api.usedTodayTokens >= api.dailyTokenLimit ? "text-red-600" : "text-zinc-700"}`}>
                  Today {fmtNum(api.usedTodayTokens)} / {fmtNum(api.dailyTokenLimit)} tokens
                  {api.usedTodayTokens >= api.dailyTokenLimit ? " (limit reached; switched today)" : ""}
                </span>
              ) : (
                <span className="font-mono text-zinc-400">Unlimited</span>
              )}
            </div>
          </dl>
          <AiCapabilityBadges capabilities={api.capabilities} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600"
          >
            Edit
          </button>
          {!api.isDefault && (
            <form action={setDefaultAiApiAction.bind(null, api.id)}>
              <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
                Set default
              </button>
            </form>
          )}
          <form action={toggleAiApiAction.bind(null, api.id, !api.enabled)}>
            <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
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
  );
}

export function AiApiManager({
  apis,
  volcengineApis,
}: {
  apis: AiApiConfigForClient[];
  volcengineApis: VolcengineApiForClient[];
}) {
  const genericApis = apis.filter((api) => api.provider !== "volcengine");
  const [genericPanel, setGenericPanel] = useState<"list" | "add" | string>("list");

  return (
    <div className="space-y-8">
      <VolcengineApiSetup configs={volcengineApis} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-800">Other OpenAI-compatible APIs</div>
            <div className="text-xs text-zinc-400 mt-1">Kimi, DeepSeek, Tongyi, and other Chat Completions endpoints</div>
          </div>
          {genericPanel === "list" && (
            <button
              type="button"
              onClick={() => setGenericPanel("add")}
              className="rounded-lg bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-700 shrink-0"
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
            <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">
              No other API configurations yet. Until you add one, AI_API_KEY in `.env` remains the compatibility fallback.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
