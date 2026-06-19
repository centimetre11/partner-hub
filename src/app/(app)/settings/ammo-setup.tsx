"use client";

import { useState, useTransition } from "react";
import {
  saveSystemAmmoConfigAction,
  testSystemAmmoGdriveAction,
  testSystemAmmoKmsAction,
  clearSystemAmmoServiceAccountAction,
} from "@/lib/ammo-actions";
import type { AmmoConfigForClient } from "@/lib/ammo-config";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function AmmoSetup({ config }: { config: AmmoConfigForClient }) {
  const s = useMessages().ammoSettings;
  const [folderUrl, setFolderUrl] = useState(config.gdriveFolderUrl);
  const [serviceAccount, setServiceAccount] = useState("");
  const [kmsUrls, setKmsUrls] = useState(config.kmsPageUrls);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (fd: FormData) => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("gdriveFolderUrl", folderUrl.trim());
      if (serviceAccount.trim()) fd.set("gdriveServiceAccount", serviceAccount.trim());
      fd.set("kmsPageUrls", kmsUrls);
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

  function testKms() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("kmsPageUrls", kmsUrls);
      const res = await testSystemAmmoKmsAction(fd);
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

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600">{s.desc}</p>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-800">{s.gdriveFolderUrl}</label>
        <input
          value={folderUrl}
          onChange={(e) => setFolderUrl(e.target.value)}
          placeholder={s.gdriveFolderUrlHint}
          className={input}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-800">{s.gdriveServiceAccount}</label>
        <p className="text-xs text-zinc-500 leading-relaxed">{s.gdriveServiceAccountHint}</p>
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
            className="text-xs text-zinc-400 hover:text-red-600"
          >
            {s.clearServiceAccount}
          </button>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-800">{s.kmsPageUrls}</label>
        <p className="text-xs text-zinc-500">{s.kmsPageUrlsHint}</p>
        <textarea
          value={kmsUrls}
          onChange={(e) => setKmsUrls(e.target.value)}
          placeholder={s.kmsPageUrlsPlaceholder}
          rows={4}
          className={input}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(saveSystemAmmoConfigAction)}
          disabled={pending}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {s.save}
        </button>
        <button
          type="button"
          onClick={() => testGdrive(false)}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
        >
          {s.testGdrive}
        </button>
        {config.gdriveServiceAccountConfigured && (
          <button
            type="button"
            onClick={() => testGdrive(true)}
            disabled={pending}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            {s.testGdriveStored}
          </button>
        )}
        <button
          type="button"
          onClick={testKms}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
        >
          {s.testKms}
        </button>
      </div>

      {message && <p className="text-sm text-emerald-700 whitespace-pre-wrap">{message}</p>}
      {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}
    </div>
  );
}
