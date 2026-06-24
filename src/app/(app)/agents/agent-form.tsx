"use client";

import { useState } from "react";
import { upsertAgentAction } from "@/lib/agent-actions";
import type { PromptSkillOption, ToolOption } from "@/lib/skill-resolver";
import { useMessages, useLocale } from "@/lib/i18n/context";
import { getToolDesc, getToolLabel } from "@/lib/tool-labels";

const AGENT_PUSH_SKILLS = ["push_wecom", "send_wecom_app", "send_email"] as const;

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
  pushEmailTo?: string;
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
  const { agents: a } = useMessages();
  const locale = useLocale();
  const [trigger, setTrigger] = useState(agent.trigger);
  const [frequency, setFrequency] = useState(agent.frequency);
  const [scopeType, setScopeType] = useState(agent.scopeType);
  const [pushEmail, setPushEmail] = useState(agent.skills.includes("send_email"));

  const toolkitOptions = toolOptions.filter((t) => !AGENT_PUSH_SKILLS.includes(t.name as (typeof AGENT_PUSH_SKILLS)[number]));
  const pushWecomOption = toolOptions.find((t) => t.name === "push_wecom");
  const pushWecomAppOption = toolOptions.find((t) => t.name === "send_wecom_app");
  const pushEmailOption = toolOptions.find((t) => t.name === "send_email");

  return (
    <form action={upsertAgentAction} className="space-y-5">
      {agent.id && <input type="hidden" name="id" value={agent.id} />}

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">{a.formBasicInfo}</h3>
        <div className="flex gap-3">
          <label className="space-y-1 w-20">
            <span className="text-xs text-slate-500">{a.formIcon}</span>
            <input name="icon" defaultValue={agent.icon} className={`${input} text-center text-lg`} />
          </label>
          <label className="space-y-1 flex-1">
            <span className="text-xs text-slate-500">{a.formName}</span>
            <input name="name" required defaultValue={agent.name} placeholder={a.formNamePlaceholder} className={input} />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs text-slate-500">{a.formDesc}</span>
          <input name="description" defaultValue={agent.description} placeholder={a.formDescPlaceholder} className={input} />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs text-slate-500">{a.formInstructions}</span>
          <textarea
            name="instructions"
            required
            defaultValue={agent.instructions}
            rows={7}
            placeholder={a.formInstructionsPlaceholder}
            className={input}
          />
        </label>
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{a.formToolKit}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{a.formToolKitDesc}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {toolkitOptions.map((t) => (
            <label
              key={t.name}
              className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-3.5 py-2.5 cursor-pointer hover:border-slate-300"
            >
              <input type="checkbox" name="skills" value={t.name} defaultChecked={agent.skills.includes(t.name)} className="mt-0.5 rounded" />
              <span className="min-w-0">
                <span className="text-sm font-medium text-slate-800 block">{getToolLabel(t.name, locale)}</span>
                <span className="text-xs text-slate-400 font-mono">{t.name}</span>
                <span className="text-xs text-slate-400 block mt-0.5">{getToolDesc(t.name, locale)}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {promptSkillOptions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{a.formSkillLibrary}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{a.formSkillLibraryDesc}</p>
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
                  <span className="text-xs text-purple-500">{a.formMethodology}</span>
                  <span className="text-xs text-slate-400 block">{s.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">{a.formTriggerScope}</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">{a.formTrigger}</span>
            <select name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} className={input}>
              <option value="MANUAL">{a.formTriggerManual}</option>
              <option value="SCHEDULE">{a.formTriggerSchedule}</option>
            </select>
          </label>
          {trigger === "SCHEDULE" && (
            <>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{a.formFrequency}</span>
                <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} className={input}>
                  <option value="HOURLY">{a.hourly}</option>
                  <option value="DAILY">{a.daily}</option>
                  <option value="WEEKLY">{a.weekly}</option>
                </select>
              </label>
              {frequency === "WEEKLY" && (
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">{a.formDayOfWeek}</span>
                  <select name="runWeekday" defaultValue={agent.runWeekday} className={input}>
                    {a.weekdays.map((d, i) => (
                      <option key={d} value={i + 1}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {frequency !== "HOURLY" && (
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">{a.formTime}</span>
                  <select name="runHour" defaultValue={agent.runHour} className={input}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {h}:00
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label className="space-y-1">
            <span className="text-xs text-slate-500">{a.formScope}</span>
            <select name="scopeType" value={scopeType} onChange={(e) => setScopeType(e.target.value)} className={input}>
              <option value="ALL">{a.formScopeAll}</option>
              <option value="PARTNER">{a.formScopePartner}</option>
            </select>
          </label>
          {scopeType === "PARTNER" && (
            <label className="space-y-1">
              <span className="text-xs text-slate-500">{a.formPartner}</span>
              <select name="partnerId" defaultValue={agent.partnerId} className={input}>
                <option value="">{a.formSelectPartner}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">{a.pushSharing}</h3>
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500">{a.pushChannels}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {pushWecomOption && (
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-3.5 py-2.5 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  name="skills"
                  value="push_wecom"
                  defaultChecked={agent.skills.includes("push_wecom")}
                  className="mt-0.5 rounded"
                />
                <span className="min-w-0">
                  <span className="text-sm font-medium text-slate-800 block">{a.pushWecom}</span>
                  <span className="text-xs text-slate-400 font-mono">push_wecom</span>
                  <span className="text-xs text-slate-400 block mt-0.5">{a.pushWecomDesc}</span>
                </span>
              </label>
            )}
            {pushWecomAppOption && (
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-3.5 py-2.5 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  name="skills"
                  value="send_wecom_app"
                  defaultChecked={agent.skills.includes("send_wecom_app")}
                  className="mt-0.5 rounded"
                />
                <span className="min-w-0">
                  <span className="text-sm font-medium text-slate-800 block">{a.pushWecomApp}</span>
                  <span className="text-xs text-slate-400 font-mono">send_wecom_app</span>
                  <span className="text-xs text-slate-400 block mt-0.5">{a.pushWecomAppDesc}</span>
                </span>
              </label>
            )}
            {pushEmailOption && (
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-3.5 py-2.5 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  name="skills"
                  value="send_email"
                  defaultChecked={agent.skills.includes("send_email")}
                  onChange={(e) => setPushEmail(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span className="min-w-0">
                  <span className="text-sm font-medium text-slate-800 block">{a.pushEmail}</span>
                  <span className="text-xs text-slate-400 font-mono">send_email</span>
                  <span className="text-xs text-slate-400 block mt-0.5">{a.pushEmailDesc}</span>
                </span>
              </label>
            )}
          </div>
        </div>
        {pushEmail && (
          <label className="space-y-1 block">
            <span className="text-xs text-slate-500">{a.pushEmailTo}</span>
            <input
              name="pushEmailTo"
              type="email"
              defaultValue={agent.pushEmailTo ?? ""}
              placeholder={a.pushEmailToPlaceholder}
              className={input}
            />
          </label>
        )}
        <label className="space-y-1 block">
          <span className="text-xs text-slate-500">{a.webhookUrl}</span>
          <input name="webhookUrl" defaultValue={agent.webhookUrl} placeholder={a.webhookPlaceholder} className={input} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="shared" defaultChecked={agent.shared} className="rounded" />
          <span className="text-sm text-slate-700">{a.shareWithTeam}</span>
        </label>
        <p className="text-xs text-slate-400">{a.pushSharingFootnote}</p>
      </div>

      <div className="flex justify-end gap-2">
        <button className="rounded-lg bg-slate-900 text-white px-6 py-2.5 text-sm font-medium hover:bg-slate-800">
          {agent.id ? a.saveChanges : a.createAgentBtn}
        </button>
      </div>
    </form>
  );
}
