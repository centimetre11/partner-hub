"use client";

import { useEffect, useState, useTransition } from "react";
import {
  saveSystemAmmoConfigAction,
  testSystemAmmoGdriveAction,
  clearSystemAmmoServiceAccountAction,
  saveGdriveOauthClientAction,
  disconnectGdriveUploaderAction,
} from "@/lib/ammo-actions";
import type { AmmoConfigForClient } from "@/lib/ammo-config";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function AmmoSetup({ config }: { config: AmmoConfigForClient }) {
  const s = useMessages().ammoSettings;
  const [folderUrl, setFolderUrl] = useState(config.gdriveFolderUrl);
  const [serviceAccount, setServiceAccount] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const oauthStatus = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("gdrive_oauth")
    : null;
  const oauthOkMap: Record<string, string> = { connected: s.oauthConnected };
  const oauthErrMap: Record<string, string> = {
    denied: s.oauthDenied,
    no_refresh: s.oauthNoRefresh,
    bad_state: s.oauthBadState,
    missing_client: s.oauthMissingClient,
    error: s.oauthError,
  };
  const [message, setMessage] = useState<string | null>(
    oauthStatus ? oauthOkMap[oauthStatus] ?? null : null,
  );
  const [error, setError] = useState<string | null>(
    oauthStatus ? oauthErrMap[oauthStatus] ?? null : null,
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!oauthStatus) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("gdrive_oauth");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [oauthStatus]);

  function run(action: (fd: FormData) => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("gdriveFolderUrl", folderUrl.trim());
      if (serviceAccount.trim()) fd.set("gdriveServiceAccount", serviceAccount.trim());
      const res = await action(fd);
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
      if (res.ok && serviceAccount.trim()) setServiceAccount("");
    });
  }

  function testGdrive(useStored: boolean) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("gdriveFolderUrl", folderUrl.trim());
      if (serviceAccount.trim()) fd.set("gdriveServiceAccount", serviceAccount.trim());
      if (useStored) fd.set("useStoredSa", "1");
      const res = await testSystemAmmoGdriveAction(fd);
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  function clearSa() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await clearSystemAmmoServiceAccountAction();
      if (res.message) setMessage(res.message);
    });
  }

  function saveOauthClient() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("gdriveOauthClientId", oauthClientId.trim());
      if (oauthClientSecret.trim()) fd.set("gdriveOauthClientSecret", oauthClientSecret.trim());
      const res = await saveGdriveOauthClientAction(fd);
      if (res.error) setError(res.error);
      else if (res.message) {
        setMessage(res.message);
        setOauthClientSecret("");
      }
    });
  }

  function disconnectUploader() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await disconnectGdriveUploaderAction();
      if (res.message) setMessage(res.message);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">{s.desc}</p>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-800">{s.gdriveFolderUrl}</label>
        <input
          value={folderUrl}
          onChange={(e) => setFolderUrl(e.target.value)}
          placeholder={s.gdriveFolderUrlHint}
          className={input}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-800">{s.gdriveServiceAccount}</label>
        <p className="text-xs text-slate-500 leading-relaxed">{s.gdriveServiceAccountHint}</p>
        {config.gdriveServiceAccountConfigured && (
          <p className="text-xs text-emerald-700">
            {s.gdriveSaConfigured}
            {config.gdriveServiceAccountEmail ? ` (${config.gdriveServiceAccountEmail})` : ""}
          </p>
        )}
        <textarea
          value={serviceAccount}
          onChange={(e) => setServiceAccount(e.target.value)}
          placeholder={s.gdriveServiceAccountPlaceholder}
          rows={4}
          className={`${input} font-mono text-xs`}
        />
        {config.gdriveServiceAccountConfigured && (
          <button
            type="button"
            onClick={clearSa}
            disabled={pending}
            className="text-xs text-slate-400 hover:text-red-600"
          >
            {s.clearServiceAccount}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(saveSystemAmmoConfigAction)}
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {s.save}
        </button>
        <button
          type="button"
          onClick={() => testGdrive(false)}
          disabled={pending}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {s.testGdrive}
        </button>
        {config.gdriveServiceAccountConfigured && (
          <button
            type="button"
            onClick={() => testGdrive(true)}
            disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {s.testGdriveStored}
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{s.oauthTitle}</h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-1">{s.oauthDesc}</p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-800">{s.oauthClientId}</label>
          <input
            value={oauthClientId}
            onChange={(e) => setOauthClientId(e.target.value)}
            placeholder="xxxxxx.apps.googleusercontent.com"
            className={input}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-800">{s.oauthClientSecret}</label>
          {config.gdriveOauthClientConfigured && (
            <p className="text-xs text-emerald-700">{s.oauthClientConfigured}</p>
          )}
          <input
            type="password"
            value={oauthClientSecret}
            onChange={(e) => setOauthClientSecret(e.target.value)}
            placeholder={s.oauthClientSecretPlaceholder}
            className={input}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveOauthClient}
            disabled={pending}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            {s.saveOauthClient}
          </button>
          {config.gdriveOauthClientConfigured && (
            <a
              href="/api/google/oauth/start"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            >
              {config.gdriveUploaderConnected ? s.reconnectGoogle : s.connectGoogle}
            </a>
          )}
          {config.gdriveUploaderConnected && (
            <button
              type="button"
              onClick={disconnectUploader}
              disabled={pending}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              {s.disconnectGoogle}
            </button>
          )}
        </div>

        <p className="text-xs text-slate-600">
          {config.gdriveUploaderConnected
            ? `${s.uploaderConnected} ${config.gdriveUploaderEmail ?? ""}`
            : s.uploaderNotConnected}
        </p>
      </div>

      {message && <p className="text-sm text-emerald-700 whitespace-pre-wrap">{message}</p>}
      {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}
    </div>
  );
}
