"use client";

import { useState, useTransition } from "react";
import {
  saveSystemKmsCredentialAction,
  testSystemKmsCredentialAction,
  deleteSystemKmsCredentialAction,
} from "@/lib/system-kms-actions";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export type SystemKmsForClient = {
  configured: boolean;
  keyTail: string;
  baseUrl: string;
  updatedAt?: string;
};

export function SystemKmsSetup({ credential }: { credential: SystemKmsForClient }) {
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
      const res = await testSystemKmsCredentialAction(fd);
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  function remove() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      await deleteSystemKmsCredentialAction();
      setMessage("Team KMS fallback cleared");
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Team fallback KMS token for users who have not saved a personal token. Priority: personal → team DB →{" "}
        <code className="text-xs bg-zinc-100 px-1 rounded">KMS_SYSTEM_TOKEN</code> env.
      </p>
      {credential.configured ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          Team fallback configured (tail {credential.keyTail}) · {credential.baseUrl}
          {credential.updatedAt && ` · Updated ${new Date(credential.updatedAt).toLocaleString("en-US")}`}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          No team fallback yet. Users without a personal token cannot use read_kms / write_kms unless env is set.
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Team access token</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={credential.configured ? "Leave blank to keep stored token" : "Paste PAT"}
          className={input}
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !token.trim()}
          onClick={() => run(saveSystemKmsCredentialAction)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-40"
        >
          Save team token
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(testSystemKmsCredentialAction)}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:border-indigo-300 disabled:opacity-40"
        >
          Test (pageId=1420741418)
        </button>
        {credential.configured && (
          <>
            <button type="button" disabled={pending} onClick={testStored} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm">
              Test stored
            </button>
            <button type="button" disabled={pending} onClick={remove} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm">
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
