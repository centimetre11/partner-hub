"use client";

import { createContext, useCallback, useContext, useState } from "react";

type AssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openAssistant: () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openAssistant = useCallback(() => setOpen(true), []);

  return (
    <AssistantContext.Provider value={{ open, setOpen, openAssistant }}>{children}</AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider");
  return ctx;
}
