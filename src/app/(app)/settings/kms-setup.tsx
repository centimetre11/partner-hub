"use client";

import { useState, useTransition } from "react";
import { saveKmsCredentialAction, testKmsCredentialAction, deleteKmsCredentialAction } from "@/lib/kms-actions";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export type KmsCredentialForClient = {
  configured: boolean;
  keyTail: string;
  baseUrl: string;
  updatedAt?: string;
};

export function KmsSetup({ credential }: { credential: KmsCredentialForClient }) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (fd: FormData) => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      if (token.trim()) fd.set("accessToken", token.trim());
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
      const res = await testKmsCredentialAction(fd);
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  function remove() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      await deleteKmsCredentialAction();
      setMessage("已清除 KMS 令牌");
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-zinc-500 leading-relaxed">
        连接帆软 KMS（Confluence 7.x）。每人填写一次{" "}
        <a href="https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html" className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">
          Personal Access Token
        </a>
        ，保存后 Agent 与 AI 助手调用 <code className="text-xs bg-zinc-100 px-1 rounded">read_kms</code> 时自动使用，无需重复输入。
      </p>

      {credential.configured ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          已配置（尾号 {credential.keyTail}）· {credential.baseUrl}
          {credential.updatedAt && ` · 更新于 ${new Date(credential.updatedAt).toLocaleString("zh-CN")}`}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          尚未配置。保存后可读取你有权限的 KMS 页面。
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">个人访问令牌 {credential.configured && "（留空则仅更新其他项或测试已存令牌）"}</span>
        <input
          name="accessToken"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={credential.configured ? "留空表示不修改已存令牌" : "粘贴 PAT，仅保存一次"}
          className={input}
          autoComplete="off"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !token.trim()}
          onClick={() => run(saveKmsCredentialAction)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-40"
        >
          保存令牌
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testKmsCredentialAction)}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:border-indigo-300 disabled:opacity-40"
        >
          测试（pageId=1420741418）
        </button>
        {credential.configured && (
          <>
            <button type="button" disabled={pending} onClick={testStored} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:border-indigo-300 disabled:opacity-40">
              用已存令牌测试
            </button>
            <button type="button" disabled={pending} onClick={remove} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-40">
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
