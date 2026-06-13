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

const monoInput =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono";
const textInput =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500";
const label = "text-xs font-medium text-zinc-500";

function StateMessage({ state }: { state: AiApiActionState }) {
  if (state?.error) return <p className="text-xs text-red-600 whitespace-pre-wrap">{state.error}</p>;
  if (state?.ok) return <p className="text-xs text-emerald-600 whitespace-pre-wrap">{state.message ?? "已保存"}</p>;
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
  createdAt: string;
};

function ParsePreview({ snippet }: { snippet: string }) {
  const parsed = useMemo(() => parseVolcengineSnippet(snippet), [snippet]);
  if (!snippet.trim()) return null;

  if (!parsed.ok) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
        解析失败：{parsed.error}
      </div>
    );
  }

  const summary = summarizeVolcengineExtra(parsed.data.extraConfig);

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1">
      <div className="font-medium">已识别配置</div>
      <div>Base URL：{parsed.data.baseUrl}</div>
      <div>模型接入点：{parsed.data.model}</div>
      {parsed.data.apiKey && <div>Key：已从片段读取（尾号 {parsed.data.apiKey.slice(-4)}）</div>}
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
          {pending ? "测试中..." : "测试连通性"}
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
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900">{cfg.name}</span>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">火山引擎</span>
            {cfg.isDefault && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">默认</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
            >
              {cfg.enabled ? "已启用" : "已停用"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-zinc-400">接入点</dt>
              <dd className="font-mono text-zinc-800 mt-0.5">{cfg.model}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">API Key</dt>
              <dd className="font-mono text-zinc-800 mt-0.5">尾号 {cfg.keyTail}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-400">Base URL</dt>
              <dd className="font-mono text-zinc-800 mt-0.5 break-all">{cfg.baseUrl}</dd>
            </div>
          </dl>
          {extraSummary.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-orange-700">
              {extraSummary.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          )}
          {!cfg.keyValid && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              API Key 未正确保存（可能是占位符或格式无效）。请点击「编辑」，在密钥框重新粘贴火山方舟控制台里的完整 Key 后保存。
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-orange-300 hover:text-orange-700"
          >
            编辑
          </button>
          {!cfg.isDefault && (
            <form action={setDefaultAiApiAction.bind(null, cfg.id)}>
              <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
                设默认
              </button>
            </form>
          )}
          <form action={toggleAiApiAction.bind(null, cfg.id, !cfg.enabled)}>
            <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
              {cfg.enabled ? "停用" : "启用"}
            </button>
          </form>
          <form action={deleteAiApiAction.bind(null, cfg.id)}>
            <button className="rounded-md border border-red-100 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
              删除
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
}: {
  existing?: VolcengineApiForClient;
  onCancel: () => void;
  submitText: string;
}) {
  const initialSnippet = existing
    ? buildVolcengineSnippetFromConfig(existing.model, existing.extraConfig, existing.baseUrl)
    : "";
  const [snippet, setSnippet] = useState(initialSnippet);
  const [state, action, pending] = useActionState(upsertVolcengineApiAction, null);
  const [testState, testAction, testing] = useActionState(testVolcengineApiAction, null);

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{existing ? "编辑火山引擎配置" : "添加火山引擎配置"}</div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-800"
        >
          取消
        </button>
      </div>

      <form action={action} className="space-y-3">
        {existing && <input type="hidden" name="id" value={existing.id} />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className={label}>配置名称</span>
            <input
              name="name"
              required
              defaultValue={existing?.name ?? "火山方舟 Doubao"}
              placeholder="火山方舟 Doubao"
              className={textInput}
            />
          </label>
          <label className="space-y-1">
            <span className={label}>
              ARK API Key{existing ? `（当前尾号 ${existing.keyTail}，留空不修改）` : "（必填）"}
            </span>
            <input
              name="apiKey"
              type="password"
              required={!existing}
              placeholder={existing ? "仅更换 Key 时填写" : "从火山方舟控制台 → API Key 管理 复制"}
              className={textInput}
              autoComplete="off"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className={label}>curl 或 JSON 请求体</span>
          <textarea
            name="snippet"
            required={!existing}
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            rows={12}
            placeholder={VOLCENGINE_SNIPPET_PLACEHOLDER}
            className={`${monoInput} resize-y min-h-[220px]`}
          />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            粘贴官方 curl 即可；<strong>密钥请填在上方输入框</strong>，curl 里的 <code className="bg-white px-1 rounded">$ARK_API_KEY</code> 只是示例占位符。
            {existing ? " 若只改 Key，可不动下方内容。" : ""}
          </p>
        </label>

        <ParsePreview snippet={snippet} />

        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
          <label className="inline-flex items-center gap-1.5">
            <input name="enabled" type="checkbox" defaultChecked={existing?.enabled ?? true} className="rounded border-zinc-300" />
            启用
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input name="isDefault" type="checkbox" defaultChecked={existing?.isDefault ?? !existing} className="rounded border-zinc-300" />
            设为默认
          </label>
        </div>

        <StateMessage state={state} />

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-orange-600 text-white px-4 py-2 text-sm hover:bg-orange-500 disabled:opacity-50"
          >
            {pending ? "保存中..." : submitText}
          </button>
        </div>
      </form>

      <form action={testAction} className="flex flex-wrap items-start gap-2 border-t border-orange-200 pt-3">
        {existing && <input type="hidden" name="id" value={existing.id} />}
        <input type="hidden" name="snippet" value={snippet} />
        <button
          type="submit"
          disabled={testing}
          className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50"
        >
          {testing ? "测试中..." : "测试当前表单（保存前）"}
        </button>
        <p className="text-xs text-zinc-500 flex-1 min-w-[200px]">
          保存前可先用表单里的 Key 和 curl 试连通；已保存的配置也可在卡片上直接点「测试连通性」。
        </p>
        <div className="w-full">
          <StateMessage state={testState} />
        </div>
      </form>
    </div>
  );
}

export function VolcengineApiSetup({ configs }: { configs: VolcengineApiForClient[] }) {
  const [panel, setPanel] = useState<"list" | "add" | string>("list");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            火
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-900">火山引擎</div>
            <div className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-2xl">
              Responses API + 内置联网搜索。配置列表与编辑表单分开：平时只看状态，需要改 Key 或 curl 时再点「编辑」。
            </div>
          </div>
        </div>
        {panel === "list" && (
          <button
            type="button"
            onClick={() => setPanel("add")}
            className="rounded-lg bg-orange-600 text-white px-3 py-1.5 text-xs hover:bg-orange-500 shrink-0"
          >
            + 添加配置
          </button>
        )}
      </div>

      {panel === "add" && (
        <VolcengineEditForm onCancel={() => setPanel("list")} submitText="保存火山引擎配置" />
      )}

      {panel !== "add" && configs.length === 0 && (
        <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/30 p-6 text-center text-sm text-zinc-500">
          尚未配置火山引擎。点击右上角「添加配置」，填入 API Key 并粘贴 curl 即可。
        </div>
      )}

      {configs.map((cfg) => (
        <div key={cfg.id} className="space-y-3">
          {panel === cfg.id ? (
            <VolcengineEditForm
              existing={cfg}
              onCancel={() => setPanel("list")}
              submitText="保存修改"
            />
          ) : (
            <VolcengineConfigCard cfg={cfg} onEdit={() => setPanel(cfg.id)} />
          )}
        </div>
      ))}
    </div>
  );
}
