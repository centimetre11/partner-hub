"use client";

import { useState, useTransition } from "react";
import { saveSystemAsrConfigAction } from "@/lib/asr/actions";
import type { AsrConfigForClient } from "@/lib/asr/types";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
const ta =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-400";

export function AsrSetup({ config }: { config: AsrConfigForClient }) {
  const [realtimeEnabled, setRealtimeEnabled] = useState(config.realtimeEnabled);
  const [chunkSeconds, setChunkSeconds] = useState(String(config.chunkSeconds));
  const [language, setLanguage] = useState(config.language);
  const [basePrompt, setBasePrompt] = useState(config.basePrompt);
  const [hotwords, setHotwords] = useState(config.hotwords);
  const [correctionRules, setCorrectionRules] = useState(config.correctionRules);
  const [llmCorrectEnabled, setLlmCorrectEnabled] = useState(config.llmCorrectEnabled);
  const [includePartnerNames, setIncludePartnerNames] = useState(config.includePartnerNames);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("realtimeEnabled", realtimeEnabled ? "true" : "false");
      fd.set("chunkSeconds", chunkSeconds);
      fd.set("language", language);
      fd.set("basePrompt", basePrompt);
      fd.set("hotwords", hotwords);
      fd.set("correctionRules", correctionRules);
      fd.set("llmCorrectEnabled", llmCorrectEnabled ? "true" : "false");
      fd.set("includePartnerNames", includePartnerNames ? "true" : "false");
      const res = await saveSystemAsrConfigAction(fd);
      if (res.error) setError(res.error);
      else setMessage(res.message ?? "已保存");
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-slate-500 leading-relaxed">
        用于过伙伴会议的自研录音转写（faster-whisper）。在此维护热词与纠偏规则，可持续提升伙伴名、产品名识别准确度。
        引擎地址由环境变量 <code className="bg-slate-100 px-1 rounded">ASR_BASE_URL</code> 配置。
      </p>

      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          config.asrBaseUrlConfigured
            ? "border-emerald-100 bg-emerald-50/60 text-emerald-800"
            : "border-amber-100 bg-amber-50/60 text-amber-800"
        }`}
      >
        {config.asrBaseUrlConfigured
          ? "已检测到 ASR_BASE_URL，可进行转写与近实时听写"
          : "尚未配置 ASR_BASE_URL：录音可上传，但无法转写。请部署 whisper-asr 服务。"}
        {config.updatedAt
          ? ` · 配置更新于 ${new Date(config.updatedAt).toLocaleString("zh-CN")}`
          : ""}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={realtimeEnabled}
            onChange={(e) => setRealtimeEnabled(e.target.checked)}
          />
          启用近实时转写（会中按分片边录边出字）
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">分片秒数（8–30，越小越「实时」，负载越高）</span>
          <input
            type="number"
            min={8}
            max={30}
            value={chunkSeconds}
            onChange={(e) => setChunkSeconds(e.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">识别语言</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
            <option value="auto">自动检测（中英混说推荐）</option>
            <option value="zh">仅中文</option>
            <option value="en">仅英文</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={includePartnerNames}
            onChange={(e) => setIncludePartnerNames(e.target.checked)}
          />
          自动把本场议程伙伴名加入词汇偏置（勿写指令句）
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={llmCorrectEnabled}
            onChange={(e) => setLlmCorrectEnabled(e.target.checked)}
          />
          会后整段再用 AI 按伙伴名纠偏
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">
          场景提示词（可选；勿写「请正确书写」等指令，Whisper 会把指令念进正文）
        </span>
        <textarea
          value={basePrompt}
          onChange={(e) => setBasePrompt(e.target.value)}
          rows={2}
          className={ta}
          placeholder="可留空。或只写像转写正文的短句，不要写操作指令。"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">热词表（每行一个，如伙伴简称、产品型号）</span>
        <textarea
          value={hotwords}
          onChange={(e) => setHotwords(e.target.value)}
          rows={6}
          className={ta}
          placeholder={"Redington\nCamelus\nFineReport"}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">纠偏规则（每行：错写=&gt;正确，会中实时与会后均生效）</span>
        <textarea
          value={correctionRules}
          onChange={(e) => setCorrectionRules(e.target.value)}
          rows={6}
          className={ta}
          placeholder={"雷丁顿=>Redington\n开幕拉丝=>Camelus"}
        />
        <span className="text-[11px] text-slate-400">
          发现识别错误时在此追加规则，下次开会即可纠正。也支持 <code>=</code> / <code>-&gt;</code>。
        </span>
      </label>

      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
      >
        {pending ? "保存中…" : "保存识别配置"}
      </button>
    </div>
  );
}
