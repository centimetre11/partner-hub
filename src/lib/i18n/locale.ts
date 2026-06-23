export type Locale = "zh" | "en";

export const LOCALE_COOKIE = "ph_locale";
export const DEFAULT_LOCALE: Locale = "en";

export function localeToBcp47(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}
