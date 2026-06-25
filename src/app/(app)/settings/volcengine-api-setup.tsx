"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import {
  deleteAiApiAction,
  setDefaultAiApiAction,
  testVolcengineApiAction,
  toggleAiApiAction,
  upsertVolcengineApiAction,
  type AiApiActionState,
} from "@/lib/ai-settings-actions";
import {
  buildVolcengineSnippetFromConfig,
  parseVolcengineSnippet,
  summarizeVolcengineExtra,
  VOLCENGINE_SNIPPET_PLACEHOLDER,
  type VolcengineExtraConfig,
} from "@/lib/volcengine-config";
import { AiCapabilityBadges, AiCapabilityFields } from "./ai-capability-fields";
import type { AiCapability } from "@/lib/ai-capabilities";
import { LEAD_RESEARCH_PRESET_CAPABILITIES } from "@/lib/ai-capabilities";

const monoInput =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono";
const textInput =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500";
const label = "text-xs font-medium text-slate-500";

function StateMessage({ state }: { state: AiApiActionState }) {
  if (state?.error) return <p className="text-xs text-red-600 whitespace-pre-wrap">{state.error}</p>;
  if (state?.ok) return <p className="text-xs text-emerald-600 whitespace-pre-wrap">{state.message ?? "Saved"}</p>;
  return null;
}

export type VolcengineApiForClient = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  keyTail: string;
  keyValid: boolean;
  extraConfig: VolcengineExtraConfig | null;
  capabilities: AiCapability[];
  dailyTokenLimit: number | null;
  usedTodayTokens: number;
  priority: number;
  createdAt: string;
};

function fmtNum(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function ParsePreview({ snippet }: { snippet: string }) {
  const parsed = useMemo(() => parseVolcengineSnippet(snippet), [snippet]);
  if (!snippet.trim()) return null;

  if (!parsed.ok) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
        Parse failed: {parsed.error}
      </div>
    );
  }

  const summary = summarizeVolcengineExtra(parsed.data.extraConfig);

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1">
      <div className="font-medium">Recognized configuration</div>
      <div>Base URL: {parsed.data.baseUrl}</div>
      <div>Model endpoint: {parsed.data.model}</div>
      {parsed.data.apiKey && <div>Key: read from snippet (tail {parsed.data.apiKey.slice(-4)})</div>}
      {summary.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function VolcengineTestButton({ configId }: { configId: string }) {
  const [state, action, pending] = useActionState(testVolcengineApiAction, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={configId} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-orange-200 px-2.5 py-1 text-xs text-orange-700 hover:bg-orange-50 disabled:opacity-50"
        >
          {pending ? "Testing..." : "Test connection"}
        </button>
      </div>
      <StateMessage state={state} />
    </form>
  );
}

function VolcengineConfigCard({
  cfg,
  onEdit,
}: {
  cfg: VolcengineApiForClient;
  onEdit: () => void;
}) {
  const extraSummary = cfg.extraConfig ? summarizeVolcengineExtra(cfg.extraConfig) : [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{cfg.name}</span>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">Volcengine</span>
            {cfg.isDefault && (
              <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">Default</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
            >
              {cfg.enabled ? "Enabled" : "Disabled"}
            </span>
            {cfg.priority !== 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Priority {cfg.priority}</span>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-slate-400">Endpoint</dt>
              <dd className="font-mono text-slate-800 mt-0.5">{cfg.model}</dd>
            </div>
            <div>
              <dt className="text-slate-400">API Key</dt>
              <dd className="font-mono text-slate-800 mt-0.5">Tail {cfg.keyTail}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-400">Base URL</dt>
              <dd className="font-mono text-slate-800 mt-0.5 break-all">{cfg.baseUrl}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-400">Daily token limit</dt>
              {cfg.dailyTokenLimit ? (
                <dd className={`font-mono mt-0.5 ${cfg.usedTodayTokens >= cfg.dailyTokenLimit ? "text-red-600" : "text-slate-800"}`}>
                  Today {fmtNum(cfg.usedTodayTokens)} / {fmtNum(cfg.dailyTokenLimit)}
                  {cfg.usedTodayTokens >= cfg.dailyTokenLimit ? " (limit reached; switched to another model today)" : ""}
                </dd>
              ) : (
                <dd className="font-mono text-slate-400 mt-0.5">Unlimited</dd>
              )}
            </div>
          </dl>
          {extraSummary.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-orange-700">
              {extraSummary.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          )}
          <AiCapabilityBadges capabilities={cfg.capabilities} />
          {!cfg.keyValid && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              API Key was not saved correctly (possibly a placeholder or invalid format). Click &quot;Edit&quot;, paste the full key from the Volcengine Ark console into the key field, and save.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-orange-300 hover:text-orange-700"
          >
            Edit
          </button>
          {!cfg.isDefault && (
            <form action={setDefaultAiApiAction.bind(null, cfg.id)}>
              <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-sky-600">
                Set default
              </button>
            </form>
          )}
          <form action={toggleAiApiAction.bind(null, cfg.id, !cfg.enabled)}>
            <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-sky-600">
              {cfg.enabled ? "Disable" : "Enable"}
            </button>
          </form>
          <form action={deleteAiApiAction.bind(null, cfg.id)}>
            <button className="rounded-md border border-red-100 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
              Delete
            </button>
          </form>
        </div>
      </div>
      <VolcengineTestButton configId={cfg.id} />
    </div>
  );
}

function VolcengineEditForm({
  existing,
  onCancel,
  submitText,
  formTitle,
  defaultName,
  defaultPriority,
  defaultCapabilities,
  initialSnippetOverride,
}: {
  existing?: VolcengineApiForClient;
  onCancel: () => void;
  submitText: string;
  formTitle?: string;
  defaultName?: string;
  defaultPriority?: number;
  defaultCapabilities?: AiCapability[];
  initialSnippetOverride?: string;
}) {
  const initialSnippet = existing
    ? buildVolcengineSnippetFromConfig(existing.model, existing.extraConfig, existing.baseUrl)
    : (initialSnippetOverride ?? "");
  const [snippet, setSnippet] = useState(initialSnippet);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [state, action, pending] = useActionState(upsertVolcengineApiAction, null);
  const [testState, testAction, testing] = useActionState(testVolcengineApiAction, null);

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">
          {formTitle ?? (existing ? "Edit Volcengine configuration" : "Add Volcengine configuration")}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      <form action={action} className="space-y-3">
        {existing && <input type="hidden" name="id" value={existing.id} />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>Configuration name</span>
            <input
              name="name"
              required
              defaultValue={existing?.name ?? defaultName ?? "Volcengine Ark Doubao"}
              placeholder="Volcengine Ark Doubao"
              className={textInput}
            />
          </label>
          <label className="space-y-1">
            <span className={label}>
              ARK API Key{existing ? ` (current tail ${existing.keyTail}; leave blank to keep)` : " (required)"}
            </span>
            <input
              name="apiKey"
              type="password"
              required={!existing}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={existing ? "Only fill in when replacing the key" : "Copy from Volcengine Ark console → API Key management"}
              className={textInput}
              autoComplete="off"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className={label}>curl or JSON request body</span>
          <textarea
            name="snippet"
            required={!existing}
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            rows={12}
            placeholder={VOLCENGINE_SNIPPET_PLACEHOLDER}
            className={`${monoInput} resize-y min-h-[220px]`}
          />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Paste the official curl; <strong>enter the key in the field above</strong>. The <code className="bg-white px-1 rounded">$ARK_API_KEY</code> in curl is only a placeholder.
            {existing ? " To change only the key, you can leave the content below unchanged." : ""}
          </p>
        </label>

        <ParsePreview snippet={snippet} />

        <AiCapabilityFields defaultCapabilities={existing?.capabilities ?? defaultCapabilities} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className={label}>Priority (higher numbers are tried first; default 0)</span>
            <input
              name="priority"
              type="number"
              defaultValue={existing?.priority ?? defaultPriority ?? 0}
              placeholder="Use a higher value for free-tier quotas to use them first"
              className={textInput}
            />
          </label>
          <label className="space-y-1 block">
            <span className={label}>Daily token limit (optional; blank = unlimited)</span>
            <input
              name="dailyTokenLimit"
              type="number"
              min={0}
              defaultValue={existing?.dailyTokenLimit ?? ""}
              placeholder="e.g. 1000000; auto-switch when exceeded"
              className={textInput}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <label className="inline-flex items-center gap-1.5">
            <input name="enabled" type="checkbox" defaultChecked={existing?.enabled ?? true} className="rounded border-slate-300" />
            Enabled
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input name="isDefault" type="checkbox" defaultChecked={existing?.isDefault ?? !existing} className="rounded border-slate-300" />
            Set as default
          </label>
        </div>

        <StateMessage state={state} />

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-orange-600 text-white px-4 py-2 text-sm hover:bg-orange-500 disabled:opacity-50"
          >
            {pending ? "Saving..." : submitText}
          </button>
        </div>
      </form>

      {existing && (
        <form action={testAction} className="flex flex-wrap items-start gap-2 border-t border-orange-200 pt-3">
          <input type="hidden" name="id" value={existing.id} />
          <input type="hidden" name="snippet" value={snippet} />
          <input type="hidden" name="apiKey" value={apiKeyInput} />
          <button
            type="submit"
            disabled={testing}
            className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test current form (before save)"}
          </button>
          <p className="text-xs text-slate-500 flex-1 min-w-[200px]">
            Uses the new key above if provided; otherwise reads from the database. After saving, use &quot;Test connection&quot; on the card.
          </p>
          <div className="w-full">
            <StateMessage state={testState} />
          </div>
        </form>
      )}
    </div>
  );
}

export function VolcengineApiSetup({
  configs,
  panel: controlledPanel,
  onPanelChange,
  leadResearchPreset,
  leadResearchEditId,
}: {
  configs: VolcengineApiForClient[];
  panel?: string;
  onPanelChange?: (panel: string) => void;
  leadResearchEditId?: string | null;
  leadResearchPreset?: {
    name: string;
    formTitle: string;
    submitText: string;
    priority: number;
    snippet: string;
    capabilities: AiCapability[];
  };
}) {
  const [internalPanel, setInternalPanel] = useState<"list" | "add" | string>("list");
  const panel = controlledPanel ?? internalPanel;
  const setPanel = onPanelChange ?? setInternalPanel;

  const isLeadResearchAdd = panel === "lead-research-add";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            V
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Volcengine</div>
            <div className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
              Responses API with built-in web search. Configuration list and edit form are separate: view status normally, click &quot;Edit&quot; when you need to change the key or curl.
            </div>
          </div>
        </div>
        {panel === "list" && !isLeadResearchAdd && (
          <button
            type="button"
            onClick={() => setPanel("add")}
            className="rounded-lg bg-orange-600 text-white px-3 py-1.5 text-xs hover:bg-orange-500 shrink-0"
          >
            + Add configuration
          </button>
        )}
      </div>

      {isLeadResearchAdd && leadResearchPreset && (
        <VolcengineEditForm
          onCancel={() => setPanel("list")}
          submitText={leadResearchPreset.submitText}
          formTitle={leadResearchPreset.formTitle}
          defaultName={leadResearchPreset.name}
          defaultPriority={leadResearchPreset.priority}
          defaultCapabilities={leadResearchPreset.capabilities}
          initialSnippetOverride={leadResearchPreset.snippet}
        />
      )}

      {panel === "add" && !isLeadResearchAdd && (
        <VolcengineEditForm onCancel={() => setPanel("list")} submitText="Save Volcengine configuration" />
      )}

      {panel !== "add" && !isLeadResearchAdd && configs.length === 0 && (
        <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50/30 p-6 text-center text-sm text-slate-500">
          Volcengine is not configured yet. Click &quot;Add configuration&quot; in the top right, enter your API key, and paste the curl.
        </div>
      )}

      {configs.map((cfg) => (
        <div key={cfg.id} className="space-y-3">
          {panel === cfg.id ? (
            <VolcengineEditForm
              existing={cfg}
              onCancel={() => setPanel("list")}
              submitText="Save changes"
              defaultCapabilities={
                leadResearchEditId === cfg.id
                  ? ([...new Set([...cfg.capabilities, ...LEAD_RESEARCH_PRESET_CAPABILITIES])] as AiCapability[])
                  : cfg.capabilities
              }
            />
          ) : (
            <VolcengineConfigCard cfg={cfg} onEdit={() => setPanel(cfg.id)} />
          )}
        </div>
      ))}
    </div>
  );
}
