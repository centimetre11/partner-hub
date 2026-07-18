"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** 详情页仍打开时，CRM 回调删线索后自动跳回列表（切回标签页 / 定时探测） */
export function LeadDetailGuard({ leadId }: { leadId: string }) {
  const router = useRouter();
  const checking = useRef(false);

  useEffect(() => {
    async function checkStillExists() {
      if (checking.current || document.visibilityState === "hidden") return;
      checking.current = true;
      try {
        const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { exists?: boolean };
        if (data.exists === false) {
          router.replace("/leads?removed=1");
        }
      } catch {
        /* ignore transient network errors */
      } finally {
        checking.current = false;
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void checkStillExists();
    }

    const interval = window.setInterval(checkStillExists, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [leadId, router]);

  return null;
}
