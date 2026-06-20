export type AutomationVariable = { key: string; value: string; label?: string };

export type AutomationBuilderMessage = {
  role: "user" | "assistant";
  content: string;
  trace?: unknown[];
};

export type AutomationBuilderDraft = {
  slug: string;
  name: string;
  description: string;
  taskMd: string;
  triggerType: "SCHEDULE" | "WEBHOOK" | "EVENT";
  cronExpr: string;
  timezone: string;
  validityDays: number;
  variables: AutomationVariable[];
  maxIterations: number;
  timeoutMinutes: number;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  wecomPushChatId: string;
  webhookUrl: string;
  pushEmailTo: string;
  partnerId: string;
  dueWithinDays?: number;
  rationale: string;
  questionnaire: string[];
  missingSkillNotes: string[];
};

import type { AiClarification } from "./ai-clarifications";

export type AutomationBuilderClarification = AiClarification;

export type AutomationBuilderTurn = {
  reply: string;
  questions: string[];
  clarifications: AutomationBuilderClarification[];
  ready: boolean;
  draft: AutomationBuilderDraft;
};
