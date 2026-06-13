"use client";

import { useActionState } from "react";
import {
  deleteAiApiAction,
  setDefaultAiApiAction,
  toggleAiApiAction,
  upsertAiApiAction,
  type AiApiActionState,
} from "@/lib/ai-settings-actions";

export type AiApiConfigForClient = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  keyTail: string;
  createdAt: string;
};

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const label = "text-xs font-medium text-zinc-500";

function StateMessage({ state }: { state: AiApiActionState }) {
  if (state?.error) return <p className="text-xs text-red-600">{state.error}</p>;
  if (state?.ok) return <p className="text-xs text-emerald-600">{state.message ?? "已保存"}</p>;
  return null;
}

function ApiForm({
  api,
  submitText,
}: {
  api?: AiApiConfigForClient;
  submitText: string;
}) {
  const [state, action, pending] = useActionState(upsertAiApiAction, null);

  return (
    <form action={action} className="space-y-3">
      {api && <input type="hidden" name="id" value={api.id} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={label}>名称</span>
          <input name="name" required defaultValue={api?.name ?? ""} placeholder="Kimi 生产接口" className={input} />
        </label>
        <label className="space-y-1">
          <span className={label}>模型</span>
          <input name="model" required defaultValue={api?.model ?? ""} placeholder="kimi-k2-0711-preview" className={input} />
        </label>
      </div>
      <label className="space-y-1 block">
        <span className={label}>Base URL</span>
        <input name="baseUrl" required defaultValue={api?.baseUrl ?? ""} placeholder="https://api.moonshot.cn/v1" className={input} />
      </label>
      <label className="space-y-1 block">
        <span className={label}>API Key{api ? `（当前尾号 ${api.keyTail}，留空不修改）` : ""}</span>
        <input name="apiKey" type="password" required={!api} placeholder={api ? "留空则沿用原 Key" : "sk-..."} className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
        <label className="inline-flex items-center gap-1.5">
          <input name="enabled" type="checkbox" defaultChecked={api?.enabled ?? true} className="rounded border-zinc-300" />
          启用
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input name="isDefault" type="checkbox" defaultChecked={api?.isDefault ?? false} className="rounded border-zinc-300" />
          设为默认
        </label>
      </div>
      <StateMessage state={state} />
      <button disabled={pending} className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50">
        {pending ? "保存中..." : submitText}
      </button>
    </form>
  );
}

export function AiApiManager({ apis }: { apis: AiApiConfigForClient[] }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
        <div className="text-sm font-semibold text-zinc-800 mb-3">添加大模型 API</div>
        <ApiForm submitText="添加 API" />
      </div>

      <div className="space-y-3">
        {apis.map((api) => (
          <div key={api.id} className="rounded-xl border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">{api.name}</span>
                  {api.isDefault && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">默认</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${api.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                    {api.enabled ? "已启用" : "已停用"}
                  </span>
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {api.model} · Key 尾号 {api.keyTail} · 添加于 {new Date(api.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!api.isDefault && (
                  <form action={setDefaultAiApiAction.bind(null, api.id)}>
                    <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
                      设默认
                    </button>
                  </form>
                )}
                <form action={toggleAiApiAction.bind(null, api.id, !api.enabled)}>
                  <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
                    {api.enabled ? "停用" : "启用"}
                  </button>
                </form>
                <form action={deleteAiApiAction.bind(null, api.id)}>
                  <button className="rounded-md border border-red-100 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
                    删除
                  </button>
                </form>
              </div>
            </div>
            <ApiForm api={api} submitText="保存修改" />
          </div>
        ))}
        {apis.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">
            暂无数据库 API 配置。未添加前仍可使用 `.env` 中的 AI_API_KEY 作为兼容兜底。
          </div>
        )}
      </div>
    </div>
  );
}
