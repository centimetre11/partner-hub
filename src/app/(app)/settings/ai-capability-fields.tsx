"use client";

import {
  AI_CAPABILITY_META,
  ALL_AI_CAPABILITIES,
  type AiCapability,
  DEFAULT_AI_CAPABILITIES,
} from "@/lib/ai-capabilities";

const label = "text-xs font-medium text-slate-500";

export function AiCapabilityBadges({ capabilities }: { capabilities: AiCapability[] }) {
  if (!capabilities.length) return null;
  const color: Record<AiCapability, string> = {
    chat: "bg-slate-100 text-slate-600",
    vision: "bg-sky-50 text-sky-700",
    tools: "bg-slate-50 text-sky-700",
    json: "bg-amber-50 text-amber-700",
    reasoning: "bg-violet-50 text-violet-700",
    fast: "bg-teal-50 text-teal-700",
    lead_research: "bg-indigo-50 text-indigo-700",
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
      <legend className={label}>Model capabilities (auto-selected by scenario)</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ALL_AI_CAPABILITIES.map((cap) => (
          <label
            key={cap}
            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs hover:border-slate-300"
          >
            <input
              type="checkbox"
              name="capabilities"
              value={cap}
              defaultChecked={selected.has(cap)}
              className="mt-0.5 rounded border-slate-300"
            />
            <span>
              <span className="font-medium text-slate-800">{AI_CAPABILITY_META[cap].label}</span>
              <span className="block text-slate-400 mt-0.5">{AI_CAPABILITY_META[cap].hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">
        Example: check Vision for DeepSeek V4; text-only models only need General chat / Tools / JSON. When images are sent, a vision-capable model is chosen automatically.
        Lightweight models (e.g. mini/flash) should check Lightweight & fast — simple extraction like AI add-contact is preferred on those.
        For lead web research synthesis on Volcengine, tag a lightweight endpoint with Lead research (+ JSON recommended).
      </p>
    </fieldset>
  );
}
