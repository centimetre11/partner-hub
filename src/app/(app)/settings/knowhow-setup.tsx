"use client";

import { useState, useTransition } from "react";
import {
  saveSystemKnowhowCredentialAction,
  testSystemKnowhowCredentialAction,
  deleteSystemKnowhowCredentialAction,
} from "@/lib/system-knowhow-actions";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export type SystemKnowhowForClient = {
  configured: boolean;
  keyTail: string;
  baseUrl: string;
  updatedAt?: string;
};

export function SystemKnowhowSetup({ credential }: { credential: SystemKnowhowForClient }) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (fd: FormData) => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      if (token.trim()) fd.set("apiKey", token.trim());
      fd.set("baseUrl", credential.baseUrl);
      const res = await action(fd);
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
      if (res.ok && token.trim()) setToken("");
    });
  }

  function testStored() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("useStored", "1");
      fd.set("baseUrl", credential.baseUrl);
      const res = await testSystemKnowhowCredentialAction(fd);
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  function remove() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      await deleteSystemKnowhowCredentialAction();
      setMessage("团队 Know-how 令牌已清除");
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-zinc-500 leading-relaxed">
        团队 Know-how 知识库检索 API 令牌，供工作台搜索与 Agent 工具 search_knowhow 使用。优先级：团队数据库配置 →{" "}
        <code className="text-xs bg-zinc-100 px-1 rounded">KNOWHOW_API_KEY</code> 环境变量。
      </p>
      {credential.configured ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          已配置团队 Know-how 令牌（尾号 {credential.keyTail}）· {credential.baseUrl}
          {credential.updatedAt && ` · 更新于 ${new Date(credential.updatedAt).toLocaleString("zh-CN")}`}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          尚未配置 Know-how 令牌，工作台搜索与 search_knowhow 工具不可用。
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">API 令牌（Bearer Token）</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={credential.configured ? "留空则保留已保存的令牌" : "粘贴 API Key"}
          className={input}
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !token.trim()}
          onClick={() => run(saveSystemKnowhowCredentialAction)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-40"
        >
          保存令牌
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testSystemKnowhowCredentialAction)}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:border-indigo-300 disabled:opacity-40"
        >
          测试连接
        </button>
        {credential.configured && (
          <>
            <button type="button" disabled={pending} onClick={testStored} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm">
              测试已保存
            </button>
            <button type="button" disabled={pending} onClick={remove} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm">
              清除
            </button>
          </>
        )}
      </div>
      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2 whitespace-pre-wrap">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2 whitespace-pre-wrap">{error}</div>}
    </div>
  );
}
