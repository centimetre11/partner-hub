"use client";

import { useState, useTransition } from "react";
import {
  runWeeklyReportNowAction,
  saveWeeklyReportConfigAction,
  sendWeeklyReportTestAction,
  type WeeklyReportStatus,
} from "@/lib/weekly-report-actions";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

const ROLE_OPTIONS = [
  { code: "SALES", label: "销售 SALES" },
  { code: "PRESALES", label: "售前 PRESALES" },
  { code: "ADMIN", label: "管理员 ADMIN" },
  { code: "OTHER", label: "其他 OTHER" },
];

const CRON_OPTIONS = [
  { expr: "0 0 * * 5", label: "周四晚 12 点（周五 00:00）" },
  { expr: "0 0 * * 4", label: "周四 00:00" },
  { expr: "0 18 * * 4", label: "周四 18:00" },
  { expr: "0 9 * * 0", label: "周日 09:00" },
  { expr: "0 9 * * 1", label: "周一 09:00" },
];

export function WeeklyReportSetup({
  status,
  members,
}: {
  status: WeeklyReportStatus;
  members: { id: string; name: string; email: string | null }[];
}) {
  const [enabled, setEnabled] = useState(status.enabled || !status.exists);
  const [roles, setRoles] = useState<string[]>(status.roles);
  const [managers, setManagers] = useState(status.managers.join("\n"));
  const [englishRecipients, setEnglishRecipients] = useState(status.englishRecipients.join("\n"));
  const [includeInactive, setIncludeInactive] = useState(status.includeInactive);
  const [cronExpr, setCronExpr] = useState(status.cronExpr);
  const [timezone, setTimezone] = useState(status.timezone);

  const [testUserId, setTestUserId] = useState(status.targetUsers[0]?.id ?? members[0]?.id ?? "");
  const [testEmail, setTestEmail] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCustomCron = !CRON_OPTIONS.some((c) => c.expr === cronExpr);

  function toggleRole(code: string) {
    setRoles((prev) => (prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]));
  }

  function run(action: () => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await action();
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  function save() {
    run(() => {
      const fd = new FormData();
      fd.set("enabled", enabled ? "true" : "false");
      fd.set("roles", roles.join(","));
      fd.set("managers", managers);
      fd.set("englishRecipients", englishRecipients);
      fd.set("includeInactive", includeInactive ? "true" : "false");
      fd.set("cronExpr", cronExpr.trim());
      fd.set("timezone", timezone.trim());
      return saveWeeklyReportConfigAction(fd);
    });
  }

  function runNow() {
    run(() => runWeeklyReportNowAction());
  }

  function testSend() {
    run(() => {
      const fd = new FormData();
      fd.set("userId", testUserId);
      if (testEmail.trim()) fd.set("emailOverride", testEmail.trim());
      return sendWeeklyReportTestAction(fd);
    });
  }

  return (
    <div className="space-y-5 text-sm">
      <p className="text-xs text-slate-500 leading-relaxed">
        每周定时为每位成员（含下方管理者）生成个人周报（本周完成待办 / 商务记录 / 项目工作记录 / 问答库贡献 / 新增客户 + AI 下周计划建议），发到其个人邮箱并抄送管理者；管理者另收到一份含各成员要点摘录的团队汇总。
        统计周期为「本周日 00:00 → 运行时刻」（按所选时区，覆盖中东工作周）。
      </p>

      {!status.emailConfigured && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          邮件服务尚未配置，周报将无法发送。请先在下方「系统邮件服务」中配置 QQ 邮箱 SMTP。
        </div>
      )}

      {/* 状态概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className={`text-sm font-bold ${enabled ? "text-emerald-600" : "text-slate-400"}`}>
            {status.exists ? (enabled ? "已启用" : "已停用") : "未创建"}
          </div>
          <div className="text-xs text-slate-400">状态</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-sm font-medium text-slate-800">{status.scheduleLabel}</div>
          <div className="text-xs text-slate-400">调度</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-medium text-slate-700 break-words">
            {status.nextRunAt ? new Date(status.nextRunAt).toLocaleString("zh-CN", { timeZone: status.timezone }) : "—"}
          </div>
          <div className="text-xs text-slate-400">下次运行</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-medium text-slate-700 break-words">
            {status.lastRunAt ? new Date(status.lastRunAt).toLocaleString("zh-CN", { timeZone: status.timezone }) : "从未运行"}
          </div>
          <div className="text-xs text-slate-400">上次运行</div>
        </div>
      </div>

      {/* 启用开关 */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
        <span className="text-slate-700">启用定时运行</span>
      </label>

      {/* 收报角色 */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-700">收报成员（按角色）</div>
        <div className="flex flex-wrap gap-3">
          {ROLE_OPTIONS.map((r) => (
            <label key={r.code} className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={roles.includes(r.code)} onChange={() => toggleRole(r.code)} className="h-3.5 w-3.5" />
              {r.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          当前命中 {status.targetUsers.length} 人（含管理者）：
          {status.targetUsers.map((u) => u.name).join("、") || "（无）"}
          {status.targetUsers.some((u) => !u.email) && (
            <span className="text-amber-600">（部分无邮箱，会被跳过）</span>
          )}
        </p>
      </div>

      {/* 管理者 */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700">管理者（个人周报 + 团队汇总）</span>
        <textarea
          value={managers}
          onChange={(e) => setManagers(e.target.value)}
          rows={3}
          placeholder={"saber\nzayne\nsean.song\nlican\n或直接填邮箱 someone@qq.com"}
          className={`${input} font-mono text-xs`}
        />
        <span className="text-xs text-slate-400">每行一个；可填用户名 / 显示名 / 邮箱前缀 / 完整邮箱。管理者也会收到自己的个人周报，并抄送其他管理者。</span>
      </label>
      {status.resolvedManagers.length > 0 && (
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs space-y-1">
          <div className="text-slate-500">已保存配置的解析结果：</div>
          {status.resolvedManagers.map((r) => (
            <div key={r.token} className={r.email ? "text-slate-600" : "text-red-600"}>
              {r.token} → {r.email ?? "❌ 未解析到用户/邮箱"}
            </div>
          ))}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-700">英文周报成员</span>
        <textarea
          value={englishRecipients}
          onChange={(e) => setEnglishRecipients(e.target.value)}
          rows={3}
          placeholder={"填写需要英文个人周报的成员\n用户名 / 显示名 / 邮箱前缀，每行一个"}
          className={`${input} font-mono text-xs`}
        />
        <span className="text-xs text-slate-400">
          名单内成员收到英文邮件与英文 AI 小结；优先级高于个人中心语言设置。团队汇总邮件仍为中文。
        </span>
      </label>

      {/* 调度 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">运行时间</span>
          <select
            value={isCustomCron ? "__custom__" : cronExpr}
            onChange={(e) => {
              if (e.target.value !== "__custom__") setCronExpr(e.target.value);
            }}
            className={input}
          >
            {CRON_OPTIONS.map((c) => (
              <option key={c.expr} value={c.expr}>
                {c.label}（{c.expr}）
              </option>
            ))}
            <option value="__custom__">自定义 cron…</option>
          </select>
          {isCustomCron && (
            <input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="分 时 日 月 周，如 0 0 * * 5"
              className={`${input} font-mono mt-1`}
            />
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">时区</span>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Riyadh" className={input} />
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-slate-700">本周无活动的人也发个人周报（默认不发，但仍计入管理者汇总）</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "处理中…" : "保存配置"}
        </button>
        <button
          type="button"
          disabled={pending || !status.exists}
          onClick={runNow}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:border-slate-300 disabled:opacity-40"
          title={status.exists ? "" : "请先保存配置"}
        >
          立即运行（全员发送）
        </button>
      </div>

      {/* 试发给某一个人 */}
      <div className="border-t border-slate-100 pt-4 space-y-2">
        <div className="text-xs font-medium text-slate-700">立即试发给某一个人</div>
        <p className="text-xs text-slate-400">用该成员本周真实数据生成周报，单独发送一封（默认发到其本人邮箱，可在下方覆盖收件邮箱）。</p>
        <div className="flex flex-wrap gap-2">
          <select value={testUserId} onChange={(e) => setTestUserId(e.target.value)} className={`${input} max-w-[14rem]`}>
            {members.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.email ? "" : "（无邮箱）"}
              </option>
            ))}
          </select>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="覆盖收件邮箱（可选）"
            className={`${input} max-w-[16rem]`}
          />
          <button
            type="button"
            disabled={pending || !testUserId}
            onClick={testSend}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:border-slate-300 disabled:opacity-40"
          >
            试发
          </button>
        </div>
      </div>

      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2 whitespace-pre-wrap">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2 whitespace-pre-wrap">{error}</div>}
    </div>
  );
}
