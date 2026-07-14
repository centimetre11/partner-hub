"use client";

import { useState, useTransition } from "react";
import {
  deleteSystemDingTalkConfigAction,
  saveSystemDingTalkConfigAction,
  testSystemDingTalkConfigAction,
} from "@/lib/dingtalk/actions";
import type { DingTalkConfigForClient } from "@/lib/dingtalk/config";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function DingTalkSetup({ config }: { config: DingTalkConfigForClient }) {
  const [corpId, setCorpId] = useState(config.corpId);
  const [appKey, setAppKey] = useState(config.appKey);
  const [appSecret, setAppSecret] = useState("");
  const [token, setToken] = useState(config.token);
  const [aesKey, setAesKey] = useState("");
  const [agentId, setAgentId] = useState(config.agentId);
  const [dingerTemplateId, setDingerTemplateId] = useState(config.dingerTemplateId);
  const [enabled, setEnabled] = useState(config.enabled);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buildFormData() {
    const fd = new FormData();
    fd.set("corpId", corpId.trim());
    fd.set("appKey", appKey.trim());
    if (appSecret.trim()) fd.set("appSecret", appSecret.trim());
    fd.set("token", token.trim());
    if (aesKey.trim()) fd.set("aesKey", aesKey.trim());
    fd.set("agentId", agentId.trim());
    fd.set("dingerTemplateId", dingerTemplateId.trim());
    fd.set("enabled", enabled ? "true" : "false");
    return fd;
  }

  function run(action: (fd: FormData) => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await action(buildFormData());
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
      if (res.ok && appSecret.trim()) setAppSecret("");
      if (res.ok && aesKey.trim()) setAesKey("");
    });
  }

  function remove() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await deleteSystemDingTalkConfigAction();
      if (res.message) setMessage(res.message);
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-slate-500 leading-relaxed">
        按钉钉 A1 官方流程：创建<strong>企业内部应用</strong> → 申请硬件/钉盘/事件权限 → 配置事件回调 → 管理员授权 A1
        数据读取。回调须为公网 HTTPS（localhost 收不到推送）。
      </p>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 space-y-1.5 leading-relaxed">
        <div className="font-medium text-slate-700">配置清单</div>
        <ol className="list-decimal pl-4 space-y-1">
          <li>
            开放平台创建应用并保存 CorpId / AppKey / AppSecret：
            <a className="text-sky-700 underline ml-1" href="https://open-dev.dingtalk.com/" target="_blank" rel="noreferrer">
              open-dev.dingtalk.com
            </a>
          </li>
          <li>
            权限：智能硬件设备读取、Dinger(A1) 录音数据读取、钉盘文件读取/下载、事件推送；一键开录还需填写 CorpId / AgentId / A1 录音模板 ID
          </li>
          <li>
            事件订阅勾选 <code className="bg-white px-1 rounded border border-slate-200">dinger_record_finish</code>
            ，请求 URL 填下方回调地址；Token / AES Key 与此处一致
          </li>
          <li>
            管理后台授权应用可读 A1 录音与转写：
            <a className="text-sky-700 underline ml-1" href="https://oa.dingtalk.com/" target="_blank" rel="noreferrer">
              oa.dingtalk.com
            </a>
            → 智能硬件 → DingTalk A1
          </li>
        </ol>
        <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1">
          <a className="text-sky-700 underline" href="https://open.dingtalk.com/document/development/intelligent-hardware-overview" target="_blank" rel="noreferrer">
            智能硬件概述
          </a>
          <a className="text-sky-700 underline" href="https://open.dingtalk.com/document/orgapp-server/event-subscription-overview" target="_blank" rel="noreferrer">
            事件订阅
          </a>
          <a className="text-sky-700 underline" href="https://open.dingtalk.com/document/orgapp-server/disk-overview" target="_blank" rel="noreferrer">
            钉盘文件 API
          </a>
          <a className="text-sky-700 underline" href="https://open.dingtalk.com/document/development/server-api-calling-guide" target="_blank" rel="noreferrer">
            服务端调用指南
          </a>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-slate-500">
          过伙伴会议入口在侧栏「经营」；此处仅配置钉钉凭证与回调。
        </div>
        <code className="inline-block text-xs bg-slate-100 px-2 py-1 rounded break-all">{config.callbackHint}</code>
      </div>

      {config.configured ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          已配置 · AppKey 尾号 {config.appKeyTail || "****"}
          {config.hasAesKey ? " · 已配置加解密" : " · 未配置 AES Key"}
          {config.updatedAt && ` · 更新于 ${new Date(config.updatedAt).toLocaleString("zh-CN")}`}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          尚未配置钉钉。可填写下方字段，或使用环境变量 DINGTALK_APP_KEY / DINGTALK_APP_SECRET。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">CorpId</span>
          <input value={corpId} onChange={(e) => setCorpId(e.target.value)} className={input} autoComplete="off" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">AgentId（一键开录 JSAPI 必填）</span>
          <input value={agentId} onChange={(e) => setAgentId(e.target.value)} className={input} autoComplete="off" />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-500">A1 录音模板 ID（dingerTemplateId，一键开录必填）</span>
          <input
            value={dingerTemplateId}
            onChange={(e) => setDingerTemplateId(e.target.value)}
            placeholder="钉钉 A1 / 听记模板 ID"
            className={input}
            autoComplete="off"
          />
          <span className="text-[11px] text-slate-400">
            在钉钉客户端打开过伙伴会议页时，「录音并开始开会」会调用 startDingerRecord；CorpId + AgentId + 本模板 ID 均需配置。
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">AppKey</span>
          <input value={appKey} onChange={(e) => setAppKey(e.target.value)} className={input} autoComplete="off" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">AppSecret</span>
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={config.hasAppSecret ? "留空则保留已保存密钥" : "AppSecret"}
            className={input}
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">事件 Token</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} className={input} autoComplete="off" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">EncodingAESKey</span>
          <input
            type="password"
            value={aesKey}
            onChange={(e) => setAesKey(e.target.value)}
            placeholder={config.hasAesKey ? "留空则保留已保存密钥" : "43 位 AES Key"}
            className={input}
            autoComplete="off"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        启用钉钉集成
      </label>

      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !appKey.trim()}
          onClick={() => run(saveSystemDingTalkConfigAction)}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testSystemDingTalkConfigAction)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          测试 Token
        </button>
        {config.configured && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-40"
          >
            清除配置
          </button>
        )}
      </div>
    </div>
  );
}
