"use client";

import { useEffect, useState } from "react";
import { getBrowserTimeZone } from "./meeting-datetime";

/**
 * 浏览器 IANA 时区。Next SSR 会用服务器时区（常为 Asia/Shanghai），
 * 不可在 useMemo([]) 里只算一次；挂载后再读客户端时区。
 */
export function useClientTimeZone(): string {
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    setTimeZone(getBrowserTimeZone());
  }, []);
  return timeZone;
}

/** 提交/解析时用：优先读当前浏览器时区（仅客户端有意义）。 */
export function resolveSubmitTimeZone(fallback?: string): string {
  if (typeof window !== "undefined") {
    return getBrowserTimeZone();
  }
  return fallback?.trim() || "UTC";
}
