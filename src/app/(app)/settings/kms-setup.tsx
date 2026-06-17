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
      setMessage("KMS token cleared");
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Connect to FanRuan KMS (Confluence 7.x). Enter your{" "}
        <a href="https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html" className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">
          Personal Access Token
        </a>
        {" "}once; after saving, the Agent and AI assistant will use it automatically when calling <code className="text-xs bg-zinc-100 px-1 rounded">read_kms</code> — no need to re-enter it.
      </p>

      {credential.configured ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          Configured (tail {credential.keyTail}) · {credential.baseUrl}
          {credential.updatedAt && ` · Updated ${new Date(credential.updatedAt).toLocaleString("en-US")}`}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          Not configured yet. After saving, you can read KMS pages you have access to.
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Personal access token {credential.configured && "(leave blank to update other fields or test stored token)"}</span>
        <input
          name="accessToken"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={credential.configured ? "Leave blank to keep stored token" : "Paste PAT; saved once only"}
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
          Save token
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testKmsCredentialAction)}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:border-indigo-300 disabled:opacity-40"
        >
          Test (pageId=1420741418)
        </button>
        {credential.configured && (
          <>
            <button type="button" disabled={pending} onClick={testStored} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:border-indigo-300 disabled:opacity-40">
              Test with stored token
            </button>
            <button type="button" disabled={pending} onClick={remove} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-40">
              Clear
            </button>
          </>
        )}
      </div>

      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2 whitespace-pre-wrap">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2 whitespace-pre-wrap">{error}</div>}
    </div>
  );
}
