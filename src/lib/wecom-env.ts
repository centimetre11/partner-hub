/** Detect WeCom in-app WebView (mobile + PC desktop client). */
export function isWecomInAppUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return ua.includes("wxwork") || ua.includes("wecom");
}

/** Mobile WeCom client (workbench on phone). */
export function isWecomMobileUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!isWecomInAppUserAgent(ua)) return false;
  return (
    ua.includes("mobile") ||
    ua.includes("iphone") ||
    ua.includes("android") ||
    ua.includes("ipad") ||
    ua.includes("wxworklocal")
  );
}

/** Default post-login path after WeCom OAuth. */
export function defaultWecomOAuthRedirect(userAgent: string): string {
  return isWecomMobileUserAgent(userAgent) ? "/mobile" : "/";
}
