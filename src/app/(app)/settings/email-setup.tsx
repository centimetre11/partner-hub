"use client";

import { useState, useTransition } from "react";
import {
  deleteSystemEmailConfigAction,
  saveSystemEmailConfigAction,
  sendTestEmailAction,
  testSystemEmailConfigAction,
} from "@/lib/email-actions";
import type { EmailConfigForClient } from "@/lib/email-config";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function EmailSetup({ config }: { config: EmailConfigForClient }) {
  const [fromEmail, setFromEmail] = useState(config.fromEmail);
  const [fromName, setFromName] = useState(config.fromName);
  const [authCode, setAuthCode] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buildFormData() {
    const fd = new FormData();
    fd.set("fromEmail", fromEmail.trim());
    fd.set("fromName", fromName.trim());
    if (authCode.trim()) fd.set("authCode", authCode.trim());
    fd.set("smtpHost", config.smtpHost);
    fd.set("smtpPort", String(config.smtpPort));
    fd.set("smtpSecure", config.smtpSecure ? "true" : "false");
    if (testRecipient.trim()) fd.set("testRecipient", testRecipient.trim());
    return fd;
  }

  function run(action: (fd: FormData) => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await action(buildFormData());
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
      if (res.ok && authCode.trim()) setAuthCode("");
    });
  }

  function remove() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await deleteSystemEmailConfigAction();
      if (res.message) setMessage(res.message);
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-slate-500 leading-relaxed">
        使用 QQ 邮箱作为 SMTP 发信服务器，向团队成员或其他邮箱地址发送通知。需在 QQ 邮箱设置中开启 SMTP 并生成授权码。优先级：团队数据库配置 →{" "}
        <code className="text-xs bg-slate-100 px-1 rounded">SMTP_*</code> 环境变量。
      </p>

      {config.configured ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          已配置 · {config.fromEmail || "（环境变量）"}
          {config.authTail ? ` · 授权码尾号 ${config.authTail}` : ""}
          {config.updatedAt && ` · 更新于 ${new Date(config.updatedAt).toLocaleString("zh-CN")}`}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          尚未配置邮件服务。请填写 QQ 邮箱与授权码后保存。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-500">发件 QQ 邮箱</span>
          <input
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="yourname@qq.com"
            className={input}
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">发件人显示名称（可选）</span>
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Partner Hub"
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">SMTP 授权码</span>
          <input
            type="password"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder={config.configured ? "留空则保留已保存授权码" : "QQ 邮箱 SMTP 授权码"}
            className={input}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-500">
        SMTP：{config.smtpHost}:{config.smtpPort} · {config.smtpSecure ? "SSL" : "STARTTLS"}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !fromEmail.trim()}
          onClick={() => run(saveSystemEmailConfigAction)}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
        >
          保存配置
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testSystemEmailConfigAction)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:border-slate-300 disabled:opacity-40"
        >
          测试连接
        </button>
        {config.updatedAt && (
          <button type="button" disabled={pending} onClick={remove} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm">
            清除数据库配置
          </button>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <p className="text-xs text-slate-500">发送测试邮件</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="测试收件人邮箱"
            className={`${input} max-w-sm`}
          />
          <button
            type="button"
            disabled={pending || !testRecipient.trim()}
            onClick={() => run(sendTestEmailAction)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:border-slate-300 disabled:opacity-40"
          >
            发送测试邮件
          </button>
        </div>
      </div>

      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2 whitespace-pre-wrap">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2 whitespace-pre-wrap">{error}</div>}
    </div>
  );
}
