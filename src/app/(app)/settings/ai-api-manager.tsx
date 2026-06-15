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
  return new Intl.NumberFormat("zh-CN").format(value);
}

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const label = "text-xs font-medium text-zinc-500";

function StateMessage({ state }: { state: AiApiActionState }) {
  if (state?.error) return <p className="text-xs text-red-600">{state.error}</p>;
  if (state?.ok) return <p className="text-xs text-emerald-600">{state.message ?? "已保存"}</p>;
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
        <div className="text-sm font-semibold text-zinc-900">{api ? "编辑 API" : "添加 API"}</div>
        <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-800">
          取消
        </button>
      </div>
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
          <input name="apiKey" type="password" required={!api} placeholder={api ? "留空则沿用原 Key" : "sk-..."} className={input} autoComplete="off" />
        </label>
        <AiCapabilityFields defaultCapabilities={api?.capabilities} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className={label}>优先级（数字越大越先用，默认 0）</span>
            <input
              name="priority"
              type="number"
              defaultValue={api?.priority ?? 0}
              placeholder="有免费额度的填更大值，先用完它"
              className={input}
            />
          </label>
          <label className="space-y-1 block">
            <span className={label}>每日 Token 上限（可选，留空 = 不限）</span>
            <input
              name="dailyTokenLimit"
              type="number"
              min={0}
              defaultValue={api?.dailyTokenLimit ?? ""}
              placeholder="如 1000000；超过后自动切换"
              className={input}
            />
          </label>
        </div>
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
            {api.isDefault && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">默认</span>}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${api.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
              {api.enabled ? "已启用" : "已停用"}
            </span>
            {api.priority !== 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">优先级 {api.priority}</span>
            )}
          </div>
          <dl className="mt-2 space-y-1 text-xs">
            <div><span className="text-zinc-400">模型 </span><span className="font-mono text-zinc-700">{api.model}</span></div>
            <div><span className="text-zinc-400">Base URL </span><span className="font-mono text-zinc-700 break-all">{api.baseUrl}</span></div>
            <div><span className="text-zinc-400">Key 尾号 </span><span className="font-mono text-zinc-700">{api.keyTail}</span></div>
            <div>
              <span className="text-zinc-400">每日上限 </span>
              {api.dailyTokenLimit ? (
                <span className={`font-mono ${api.usedTodayTokens >= api.dailyTokenLimit ? "text-red-600" : "text-zinc-700"}`}>
                  今日 {fmtNum(api.usedTodayTokens)} / {fmtNum(api.dailyTokenLimit)} Token
                  {api.usedTodayTokens >= api.dailyTokenLimit ? "（已达上限，本日已切换）" : ""}
                </span>
              ) : (
                <span className="font-mono text-zinc-400">不限</span>
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
            编辑
          </button>
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
            <div className="text-sm font-semibold text-zinc-800">其他 OpenAI 兼容 API</div>
            <div className="text-xs text-zinc-400 mt-1">Kimi、DeepSeek、通义等走 Chat Completions 协议的接口</div>
          </div>
          {genericPanel === "list" && (
            <button
              type="button"
              onClick={() => setGenericPanel("add")}
              className="rounded-lg bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-700 shrink-0"
            >
              + 添加 API
            </button>
          )}
        </div>

        {genericPanel === "add" && (
          <ApiEditForm onCancel={() => setGenericPanel("list")} submitText="添加 API" />
        )}

        <div className="space-y-3">
          {genericApis.map((api) =>
            genericPanel === api.id ? (
              <ApiEditForm key={api.id} api={api} onCancel={() => setGenericPanel("list")} submitText="保存修改" />
            ) : (
              <ApiConfigCard key={api.id} api={api} onEdit={() => setGenericPanel(api.id)} />
            )
          )}
          {genericApis.length === 0 && genericPanel !== "add" && (
            <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">
              暂无其他 API 配置。未添加前仍可使用 `.env` 中的 AI_API_KEY 作为兼容兜底。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
