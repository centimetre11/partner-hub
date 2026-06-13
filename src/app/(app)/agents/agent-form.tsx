"use client";

import { useState } from "react";
import { upsertAgentAction } from "@/lib/agent-actions";

type SkillOption = { name: string; label: string; desc: string; kind: string; id?: string };
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

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function AgentForm({
  agent,
  skillOptions,
  partners,
}: {
  agent: AgentData;
  skillOptions: SkillOption[];
  partners: PartnerOption[];
}) {
  const [trigger, setTrigger] = useState(agent.trigger);
  const [frequency, setFrequency] = useState(agent.frequency);
  const [scopeType, setScopeType] = useState(agent.scopeType);

  return (
    <form action={upsertAgentAction} className="space-y-5">
      {agent.id && <input type="hidden" name="id" value={agent.id} />}

      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-800">基本信息</h3>
        <div className="flex gap-3">
          <label className="space-y-1 w-20">
            <span className="text-xs text-zinc-500">图标</span>
            <input name="icon" defaultValue={agent.icon} className={`${input} text-center text-lg`} />
          </label>
          <label className="space-y-1 flex-1">
            <span className="text-xs text-zinc-500">名称 *</span>
            <input name="name" required defaultValue={agent.name} placeholder="如：Beinex 领英动态雷达" className={input} />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs text-zinc-500">一句话描述</span>
          <input name="description" defaultValue={agent.description} placeholder="它帮你做什么" className={input} />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs text-zinc-500">任务指令 *（告诉 Agent 它是谁、每次运行要做什么、输出什么）</span>
          <textarea
            name="instructions"
            required
            defaultValue={agent.instructions}
            rows={7}
            placeholder={`例如：\n你是负责监测伙伴外部动态的雷达。每次运行：\n1. 用 web_search 搜索绑定伙伴的公司名+高管名的最新公开动态（新闻、领英、招聘、中标）\n2. 有价值的发现用 add_timeline_event 写入伙伴时间线\n3. 输出简报：本周发现了什么、对我们推进合作意味着什么、建议动作`}
            className={input}
          />
        </label>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-800">技能（Agent 可以使用的工具）</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {skillOptions.map((s) =>
            s.kind === "PROMPT" && s.id ? (
              <label key={s.id} className="flex items-start gap-2.5 rounded-lg border border-purple-100 px-3.5 py-2.5 cursor-pointer hover:border-purple-200 bg-purple-50/30">
                <input type="checkbox" name="skillIds" value={s.id} defaultChecked={agent.skillIds.includes(s.id)} className="mt-0.5 rounded" />
                <span className="min-w-0">
                  <span className="text-sm font-medium text-zinc-800 block">{s.label}</span>
                  <span className="text-xs text-purple-500">提示词技能</span>
                  <span className="text-xs text-zinc-400 block">{s.desc}</span>
                </span>
              </label>
            ) : (
              <label key={s.name} className="flex items-start gap-2.5 rounded-lg border border-zinc-100 px-3.5 py-2.5 cursor-pointer hover:border-indigo-200">
                <input type="checkbox" name="skills" value={s.name} defaultChecked={agent.skills.includes(s.name)} className="mt-0.5 rounded" />
                <span className="min-w-0">
                  <span className="text-sm font-medium text-zinc-800 block">{s.label}</span>
                  <span className="text-xs text-zinc-400">{s.desc}</span>
                </span>
              </label>
            )
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-800">触发与作用域</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="space-y-1">
            <span className="text-xs text-zinc-500">触发方式</span>
            <select name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} className={input}>
              <option value="MANUAL">手动运行</option>
              <option value="SCHEDULE">定时运行</option>
            </select>
          </label>
          {trigger === "SCHEDULE" && (
            <>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">频率</span>
                <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} className={input}>
                  <option value="HOURLY">每小时</option>
                  <option value="DAILY">每天</option>
                  <option value="WEEKLY">每周</option>
                </select>
              </label>
              {frequency === "WEEKLY" && (
                <label className="space-y-1">
                  <span className="text-xs text-zinc-500">星期</span>
                  <select name="runWeekday" defaultValue={agent.runWeekday} className={input}>
                    {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((d, i) => (
                      <option key={d} value={i + 1}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
              {frequency !== "HOURLY" && (
                <label className="space-y-1">
                  <span className="text-xs text-zinc-500">时刻</span>
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
            <span className="text-xs text-zinc-500">作用域</span>
            <select name="scopeType" value={scopeType} onChange={(e) => setScopeType(e.target.value)} className={input}>
              <option value="ALL">全局（不绑定伙伴）</option>
              <option value="PARTNER">绑定某个伙伴</option>
            </select>
          </label>
          {scopeType === "PARTNER" && (
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">伙伴</span>
              <select name="partnerId" defaultValue={agent.partnerId} className={input}>
                <option value="">选择伙伴…</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-800">推送与共享</h3>
        <label className="space-y-1 block">
          <span className="text-xs text-zinc-500">Webhook URL（可选，运行结果推到飞书/企微/钉钉/Slack 群机器人）</span>
          <input name="webhookUrl" defaultValue={agent.webhookUrl} placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…" className={input} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="shared" defaultChecked={agent.shared} className="rounded" />
          <span className="text-sm text-zinc-700">团队共享（其他成员可见、可克隆）</span>
        </label>
        <p className="text-xs text-zinc-400">
          运行结果始终会进系统收件箱。Agent 对伙伴档案的修改会生成提案，人工确认后才生效；写时间线和建待办直接执行并留审计。
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-indigo-700">
          {agent.id ? "保存修改" : "创建 Agent"}
        </button>
      </div>
    </form>
  );
}
