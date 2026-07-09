"use client";

import { useEffect, useState, useTransition } from "react";
import { useMessages } from "@/lib/i18n/context";
import { disconnectGoogleMeetAction } from "@/lib/meeting-actions";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function GoogleMeetSetup({
  connected,
  googleEmail,
  clientConfigured,
}: {
  connected: boolean;
  googleEmail: string | null;
  clientConfigured: boolean;
}) {
  const m = useMessages();
  const g = m.googleMeet;
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("google_meet");
    if (!oauth) return;
    setStatus(oauth);
    params.delete("google_meet");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}#google-meet`;
    window.history.replaceState(null, "", next);
  }, []);

  const statusMsg =
    status === "connected"
      ? g.oauthConnected
      : status === "denied"
        ? g.oauthDenied
        : status === "no_refresh"
          ? g.oauthNoRefresh
          : status === "missing_client"
            ? g.oauthMissingClient
            : status === "bad_state"
              ? g.oauthBadState
              : status === "error"
                ? g.oauthError
                : null;

  function disconnect() {
    start(async () => {
      setError(null);
      const res = await disconnectGoogleMeetAction();
      if (!res.ok) setError(res.error);
      else window.location.reload();
    });
  }

  if (!clientConfigured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {g.clientNotConfigured}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600 leading-relaxed">{g.desc}</p>
      {statusMsg && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            status === "connected"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {statusMsg}
        </div>
      )}
      {connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-700">
            {g.connectedAs.replace("{email}", googleEmail || "—")}
          </span>
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50"
          >
            {pending ? g.disconnecting : g.disconnect}
          </button>
        </div>
      ) : (
        <a
          href="/api/google/meet/oauth/start"
          className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {g.connect}
        </a>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
