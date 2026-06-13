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
  parseVolcengineSnippet,
  summarizeVolcengineExtra,
  VOLCENGINE_SNIPPET_PLACEHOLDER,
  type VolcengineExtraConfig,
} from "@/lib/volcengine-config";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono";
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

function VolcengineForm({
  existing,
  submitText,
}: {
  existing?: VolcengineApiForClient;
  submitText: string;
}) {
  const [snippet, setSnippet] = useState("");
  const [state, action, pending] = useActionState(upsertVolcengineApiAction, null);
  const [testState, testAction, testing] = useActionState(testVolcengineApiAction, null);

  return (
    <div className="space-y-4">
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
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </label>
          <label className="space-y-1">
            <span className={label}>
              ARK API Key{existing ? `（当前尾号 ${existing.keyTail}，留空不修改）` : ""}
            </span>
            <input
              name="apiKey"
              type="password"
              required={!existing}
              placeholder={existing ? "留空则沿用原 Key" : "从火山方舟控制台复制"}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className={label}>粘贴 curl 或 JSON 请求体</span>
          <textarea
            name="snippet"
            required={!existing}
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            rows={12}
            placeholder={VOLCENGINE_SNIPPET_PLACEHOLDER}
            className={`${input} resize-y min-h-[220px]`}
          />
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            从火山方舟文档复制 curl 整段粘贴即可。系统会自动识别 Base URL、接入点 ID（ep-xxx）、联网搜索等参数。
            {existing ? " 更新时若留空此框，将保留原有请求配置。" : ""}
          </p>
        </label>

        <ParsePreview snippet={snippet} />

        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
          <label className="inline-flex items-center gap-1.5">
            <input name="enabled" type="checkbox" defaultChecked={existing?.enabled ?? true} className="rounded border-zinc-300" />
            启用
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input name="isDefault" type="checkbox" defaultChecked={existing?.isDefault ?? true} className="rounded border-zinc-300" />
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

      <form action={testAction} className="flex flex-wrap items-center gap-2 border-t border-orange-100 pt-3">
        {existing && <input type="hidden" name="id" value={existing.id} />}
        <input type="hidden" name="snippet" value={snippet} />
        <button
          type="submit"
          disabled={testing}
          className="rounded-lg border border-orange-200 px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50"
        >
          {testing ? "测试中..." : "测试连通性"}
        </button>
        <span className="text-xs text-zinc-400">发送一条简单请求，验证 Key 与接入点是否可用</span>
        <StateMessage state={testState} />
      </form>
    </div>
  );
}

export function VolcengineApiSetup({ configs }: { configs: VolcengineApiForClient[] }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-orange-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            火
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-900">火山引擎快速配置</div>
            <div className="text-xs text-zinc-500 mt-1 leading-relaxed">
              填入 ARK API Key，粘贴官方 curl 示例，即可启用 Responses API 与内置联网搜索（web_search）。
              保存后系统内 AI 助手、Agent 等能力将自动走该接口。
            </div>
          </div>
        </div>
        <VolcengineForm submitText="保存火山引擎配置" />
      </div>

      {configs.map((cfg) => (
        <div key={cfg.id} className="rounded-xl border border-zinc-200 p-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
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
              <div className="text-xs text-zinc-400 mt-1">
                {cfg.model} · Key 尾号 {cfg.keyTail} · {cfg.baseUrl}
              </div>
              {cfg.extraConfig?.tools?.some((t) => t.type === "web_search") && (
                <div className="text-xs text-orange-600 mt-1">已启用内置联网搜索 web_search</div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
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
          <VolcengineForm existing={cfg} submitText="更新配置" />
        </div>
      ))}
    </div>
  );
}
