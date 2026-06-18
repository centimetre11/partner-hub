"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "./locale";
import type { LabelsBundle } from "./labels/types";
import type { Messages } from "./messages/en";
import { getLabels } from "./labels";
import { getMessages } from "./messages";

export type I18nContextValue = {
  locale: Locale;
  labels: LabelsBundle;
  messages: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value: I18nContextValue = {
    locale,
    labels: getLabels(locale),
    messages: getMessages(locale),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}

export function useLabels() {
  return useI18n().labels;
}

export function useMessages() {
  return useI18n().messages;
}

export function useLocale() {
  return useI18n().locale;
}
