"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./locale";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (v === "zh" || v === "en") return v;
  return DEFAULT_LOCALE;
}

export async function setLocaleAction(formData: FormData) {
  const next = formData.get("locale") === "en" ? "en" : "zh";
  (await cookies()).set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
