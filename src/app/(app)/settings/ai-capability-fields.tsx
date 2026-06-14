"use client";

import {
  AI_CAPABILITY_META,
  ALL_AI_CAPABILITIES,
  type AiCapability,
  DEFAULT_AI_CAPABILITIES,
} from "@/lib/ai-capabilities";

const label = "text-xs font-medium text-zinc-500";

export function AiCapabilityBadges({ capabilities }: { capabilities: AiCapability[] }) {
  if (!capabilities.length) return null;
  const color: Record<AiCapability, string> = {
    chat: "bg-zinc-100 text-zinc-600",
    vision: "bg-sky-50 text-sky-700",
    tools: "bg-indigo-50 text-indigo-700",
    json: "bg-amber-50 text-amber-700",
    reasoning: "bg-violet-50 text-violet-700",
  };
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {capabilities.map((cap) => (
        <span key={cap} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${color[cap]}`}>
          {AI_CAPABILITY_META[cap].label}
        </span>
      ))}
    </div>
  );
}

export function AiCapabilityFields({ defaultCapabilities }: { defaultCapabilities?: AiCapability[] }) {
  const selected = new Set(defaultCapabilities ?? DEFAULT_AI_CAPABILITIES);
  return (
    <fieldset className="space-y-2">
      <legend className={label}>模型能力（按场景自动选模型）</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ALL_AI_CAPABILITIES.map((cap) => (
          <label
            key={cap}
            className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs hover:border-indigo-200"
          >
            <input
              type="checkbox"
              name="capabilities"
              value={cap}
              defaultChecked={selected.has(cap)}
              className="mt-0.5 rounded border-zinc-300"
            />
            <span>
              <span className="font-medium text-zinc-800">{AI_CAPABILITY_META[cap].label}</span>
              <span className="block text-zinc-400 mt-0.5">{AI_CAPABILITY_META[cap].hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-zinc-400">
        例：DeepSeek V4 勾选「图片理解」；纯文本模型只勾「通用对话 / 工具 / JSON」。发图时会自动选带 vision 的模型。
      </p>
    </fieldset>
  );
}
