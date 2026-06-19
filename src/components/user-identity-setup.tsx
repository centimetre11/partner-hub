"use client";

import { useState, useTransition } from "react";
import { saveMyUserIdentityAction, generateWecomBindCodeAction } from "@/lib/user-identity-actions";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

type Props = {
  hubName: string;
  wecomUserId: string | null;
  wecomDisplayName: string | null;
  crmSalesmanName: string | null;
  salesmen: string[];
};

export function UserIdentitySetup({
  hubName,
  wecomUserId,
  wecomDisplayName,
  crmSalesmanName,
  salesmen,
}: Props) {
  const { identity: id, wecom: w, crm } = useMessages();
  const [wecomId, setWecomId] = useState(wecomUserId ?? "");
  const [displayName, setDisplayName] = useState(wecomDisplayName ?? "");
  const [crmUser, setCrmUser] = useState(crmSalesmanName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [bindCodeHint, setBindCodeHint] = useState<string | null>(null);

  const wecomOk = !!wecomUserId;
  const displayOk = !!wecomDisplayName;
  const crmOk = !!crmSalesmanName;
  const allOk = wecomOk && crmOk;

  function save() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("wecomUserId", wecomId);
      fd.set("wecomDisplayName", displayName);
      fd.set("crmSalesmanName", crmUser);
      const res = await saveMyUserIdentityAction(fd);
      if ("error" in res && typeof res.error === "string") setError(res.error);
      else if ("message" in res && res.message) setMessage(res.message);
    });
  }

  function generateBindCode() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      setBindCodeHint(null);
      const res = await generateWecomBindCodeAction();
      if ("error" in res && typeof res.error === "string") setError(res.error);
      else if ("code" in res && res.code) {
        setBindCode(res.code);
        setBindCodeHint(res.message ?? null);
      }
    });
  }

  return (
    <div className="space-y-5 text-sm">
      <p className="text-xs text-zinc-500 leading-relaxed">{id.desc}</p>

      <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-xs space-y-1.5">
        <div className="font-medium text-zinc-700">{id.statusTitle.replace("{name}", hubName)}</div>
        <div className={wecomOk ? "text-emerald-700" : "text-amber-700"}>
          {wecomOk ? id.wecomUserIdOk.replace("{id}", wecomUserId!) : id.wecomUserIdMissing}
        </div>
        <div className={displayOk ? "text-emerald-700" : "text-zinc-500"}>
          {displayOk
            ? id.wecomDisplayOk.replace("{name}", wecomDisplayName!)
            : id.wecomDisplayOptional}
        </div>
        <div className={crmOk ? "text-emerald-700" : "text-amber-700"}>
          {crmOk ? id.crmOk.replace("{name}", crmSalesmanName!) : id.crmMissing}
        </div>
        {allOk ? (
          <div className="text-emerald-800 font-medium pt-1">{id.allReady}</div>
        ) : (
          <div className="text-amber-800 pt-1">{id.notReady}</div>
        )}
      </div>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-3 text-xs space-y-2">
        <div className="font-medium text-indigo-900">{id.botBindTitle}</div>
        <p className="text-indigo-800/90 leading-relaxed">{id.botBindDesc}</p>
        <button
          type="button"
          disabled={pending}
          onClick={generateBindCode}
          className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700 disabled:opacity-40"
        >
          {id.generateBindCode}
        </button>
        {bindCode && (
          <div className="rounded-lg bg-white border border-indigo-200 px-3 py-2 text-indigo-950">
            <div className="font-mono text-lg font-bold tracking-widest">{bindCode}</div>
            <div className="mt-1 text-indigo-700">{id.botBindSend.replace("{code}", bindCode)}</div>
          </div>
        )}
        {bindCodeHint && <p className="text-indigo-700">{bindCodeHint}</p>}
      </div>

      <details className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs text-indigo-900">
        <summary className="cursor-pointer font-medium">{id.howToFindUserid}</summary>
        <ol className="mt-2 list-decimal list-inside space-y-1.5 leading-relaxed text-indigo-800/90">
          <li>{w.howToFindBot}</li>
          <li>{id.howToWhoami}</li>
          <li>{w.howToFindAdmin}</li>
        </ol>
      </details>

      <div className="space-y-4 border-t border-zinc-100 pt-4">
        <h4 className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">{id.stepWecom}</h4>
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">{w.userIdLabel}</span>
          <input
            value={wecomId}
            onChange={(e) => setWecomId(e.target.value)}
            placeholder={w.userIdPlaceholder}
            className={input}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-zinc-400">{w.userIdHint} {id.userIdCopyHint}</p>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">{id.displayNameLabel}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={id.displayNamePlaceholder}
            className={input}
            autoComplete="off"
          />
          <p className="text-xs text-zinc-400">{id.displayNameHint}</p>
        </label>
      </div>

      <div className="space-y-4 border-t border-zinc-100 pt-4">
        <h4 className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">{id.stepCrm}</h4>
        <p className="text-xs text-zinc-500">{crm.userMappingHint}</p>
        {salesmen.length ? (
          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">{crm.selectSalesman}</span>
            <select value={crmUser} onChange={(e) => setCrmUser(e.target.value)} className={input}>
              <option value="">{crm.noMapping}</option>
              {salesmen.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">{crm.manualSalesman}</span>
            <input
              value={crmUser}
              onChange={(e) => setCrmUser(e.target.value)}
              placeholder="Fay.Wen"
              className={input}
            />
            <p className="text-xs text-zinc-400">{crm.syncFirstHint}</p>
          </label>
        )}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-40"
      >
        {id.saveAll}
      </button>

      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>}
    </div>
  );
}
