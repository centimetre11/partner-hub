"use client";

import { useEffect, useRef, useState } from "react";
import { isWecomInAppUserAgent } from "@/lib/wecom-env";
import type { Messages } from "@/lib/i18n/messages/en";

type OAuthConfig = {
  enabled: boolean;
  corpId?: string;
  agentId?: string;
  appBaseUrl?: string;
};

export function WecomWebLogin({
  messages: wm,
}: {
  messages: Messages["login"]["wecomWebLogin"];
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<{ unmount?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isWecomInAppUserAgent(navigator.userAgent)) return;

    let cancelled = false;

    async function init() {
      const res = await fetch("/api/wecom/oauth/config");
      if (!res.ok) return;
      const cfg = (await res.json()) as OAuthConfig;
      if (!cfg.enabled || !cfg.corpId || !cfg.agentId || !cfg.appBaseUrl) return;
      if (cancelled || !mountRef.current) return;

      setHidden(false);

      const ww = await import("@wecom/jssdk");
      const redirectUri = `${cfg.appBaseUrl}/api/wecom/oauth/callback?redirect=${encodeURIComponent("/")}`;
      const state = crypto.randomUUID();
      const lang =
        document.documentElement.lang === "zh-CN" ? ww.WWLoginLangType.zh : ww.WWLoginLangType.en;

      panelRef.current = ww.createWWLoginPanel({
        el: mountRef.current,
        params: {
          login_type: ww.WWLoginType.corpApp,
          appid: cfg.corpId,
          agentid: cfg.agentId,
          redirect_uri: redirectUri,
          state,
          redirect_type: ww.WWLoginRedirectType.callback,
          lang,
        },
        onLoginSuccess({ code }) {
          fetch("/api/wecom/oauth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, redirectTo: "/" }),
          })
            .then(async (r) => {
              const data = (await r.json()) as {
                ok?: boolean;
                redirectTo?: string;
                message?: string;
              };
              if (!r.ok || !data.ok) {
                throw new Error(data.message || wm.fail);
              }
              window.location.href = data.redirectTo || "/";
            })
            .catch((e) => {
              setError(e instanceof Error ? e.message : wm.fail);
            });
        },
        onLoginFail() {
          setError(wm.fail);
        },
      });
    }

    void init();

    return () => {
      cancelled = true;
      panelRef.current?.unmount?.();
      panelRef.current = null;
    };
  }, [wm.fail]);

  if (hidden) return null;

  return (
    <div className="mb-4 ui-card p-6">
      <div className="text-sm font-medium text-slate-800">{wm.title}</div>
      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{wm.desc}</p>
      <div ref={mountRef} className="mt-4 min-h-[220px]" />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
