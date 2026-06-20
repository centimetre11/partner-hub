"use client";

import { useState } from "react";
import { upsertAgentAction } from "@/lib/agent-actions";
import type { PromptSkillOption, ToolOption } from "@/lib/skill-resolver";

type PartnerOption = { id: string; name: string };

type AgentData = {
  id?: string;
  name: string;
  icon: string;
  description: string;
  instructions: string;
  skills: string[];
  skillIds: string[];
  trigger: string;
  frequency: string;
  runHour: number;
  runWeekday: number;
  scopeType: string;
  partnerId: string;
  shared: boolean;
  webhookUrl: string;
};

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function AgentForm({
  agent,
  toolOptions,
  promptSkillOptions,
  partners,
}: {
  agent: AgentData;
  toolOptions: ToolOption[];
  promptSkillOptions: PromptSkillOption[];
  partners: PartnerOption[];
}) {
  const [trigger, setTrigger] = useState(agent.trigger);
  const [frequency, setFrequency] = useState(agent.frequency);
  const [scopeType, setScopeType] = useState(agent.scopeType);

  return (
    <form action={upsertAgentAction} className="space-y-5">
      {agent.id && <input type="hidden" name="id" value={agent.id} />}

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Basic Info</h3>
        <div className="flex gap-3">
          <label className="space-y-1 w-20">
            <span className="text-xs text-slate-500">Icon</span>
            <input name="icon" defaultValue={agent.icon} className={`${input} text-center text-lg`} />
          </label>
          <label className="space-y-1 flex-1">
            <span className="text-xs text-slate-500">Name *</span>
            <input name="name" required defaultValue={agent.name} placeholder="e.g. Beinex LinkedIn Activity Radar" className={input} />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs text-slate-500">One-line description</span>
          <input name="description" defaultValue={agent.description} placeholder="What it helps you do" className={input} />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs text-slate-500">Task instructions * (tell the Agent who it is, what to do each run, and what to output)</span>
          <textarea
            name="instructions"
            required
            defaultValue={agent.instructions}
            rows={7}
            placeholder={`Example:\nYou are a radar monitoring partner external activity. Each run:\n1. Use get_partner to read the bound partner profile and contacts\n2. Use linkedin_search for executive LinkedIn updates\n3. Use web_search for news/hiring/wins\n4. Write valuable findings with add_timeline_event\n5. Output a brief: what was found, what it means, suggested actions`}
            className={input}
          />
        </label>
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Tool Kit</h3>
          <p className="text-xs text-slate-400 mt-0.5">Capability units the Agent can call directly—read profiles, search the web, create todos, etc.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {toolOptions.map((t) => (
            <label
              key={t.name}
              className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-3.5 py-2.5 cursor-pointer hover:border-slate-300"
            >
              <input type="checkbox" name="skills" value={t.name} defaultChecked={agent.skills.includes(t.name)} className="mt-0.5 rounded" />
              <span className="min-w-0">
                <span className="text-sm font-medium text-slate-800 block">{t.label}</span>
                <span className="text-xs text-slate-400 font-mono">{t.name}</span>
                <span className="text-xs text-slate-400 block mt-0.5">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {promptSkillOptions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Skill Library</h3>
            <p className="text-xs text-slate-400 mt-0.5">Methodology and professional workflows—injected into system instructions to guide how the Agent combines tools</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {promptSkillOptions.map((s) => (
              <label
                key={s.id}
                className="flex items-start gap-2.5 rounded-lg border border-purple-100 px-3.5 py-2.5 cursor-pointer hover:border-purple-200 bg-purple-50/30"
              >
                <input type="checkbox" name="skillIds" value={s.id} defaultChecked={agent.skillIds.includes(s.id)} className="mt-0.5 rounded" />
                <span className="min-w-0">
                  <span className="text-sm font-medium text-slate-800 block">{s.label}</span>
                  <span className="text-xs text-purple-500">Methodology</span>
                  <span className="text-xs text-slate-400 block">{s.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Trigger & Scope</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Trigger</span>
            <select name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} className={input}>
              <option value="MANUAL">Manual run</option>
              <option value="SCHEDULE">Scheduled run</option>
            </select>
          </label>
          {trigger === "SCHEDULE" && (
            <>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Frequency</span>
                <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} className={input}>
                  <option value="HOURLY">Hourly</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                </select>
              </label>
              {frequency === "WEEKLY" && (
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">Day of week</span>
                  <select name="runWeekday" defaultValue={agent.runWeekday} className={input}>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                      <option key={d} value={i + 1}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
              {frequency !== "HOURLY" && (
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">Time</span>
                  <select name="runHour" defaultValue={agent.runHour} className={input}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Scope</span>
            <select name="scopeType" value={scopeType} onChange={(e) => setScopeType(e.target.value)} className={input}>
              <option value="ALL">Global (no partner binding)</option>
              <option value="PARTNER">Bind to a partner</option>
            </select>
          </label>
          {scopeType === "PARTNER" && (
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Partner</span>
              <select name="partnerId" defaultValue={agent.partnerId} className={input}>
                <option value="">Select partner…</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Push & Sharing</h3>
        <label className="space-y-1 block">
          <span className="text-xs text-slate-500">Webhook URL (optional — push run results to Feishu/WeCom/DingTalk/Slack group bots)</span>
          <input name="webhookUrl" defaultValue={agent.webhookUrl} placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…" className={input} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="shared" defaultChecked={agent.shared} className="rounded" />
          <span className="text-sm text-slate-700">Share with team (visible and cloneable by other members)</span>
        </label>
        <p className="text-xs text-slate-400">
          Run results always go to the system inbox. Agent changes to partner profiles become proposals and take effect after human approval; timeline writes and todo creation execute directly with audit trail.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button className="rounded-lg bg-slate-900 text-white px-6 py-2.5 text-sm font-medium hover:bg-slate-800">
          {agent.id ? "Save Changes" : "Create Agent"}
        </button>
      </div>
    </form>
  );
}
