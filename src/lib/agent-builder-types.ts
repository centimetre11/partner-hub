export type AgentBuilderMessage = {
  role: "user" | "assistant";
  content: string;
  trace?: import("./ai-trace").AiTraceStep[];
};

export type AgentDeliveryMode = "inbox" | "wecom_chat" | "partner_group" | "webhook";

export type AgentBuilderDraft = {
  name: string;
  icon: string;
  description: string;
  instructions: string;
  skills: string[];
  skillIds: string[];
  trigger: "MANUAL" | "SCHEDULE";
  frequency: "HOURLY" | "DAILY" | "WEEKLY";
  runHour: number;
  runWeekday: number;
  scopeType: "ALL" | "PARTNER";
  partnerId: string;
  shared: boolean;
  webhookUrl: string;
  deliveryMode: AgentDeliveryMode | "";
  missingSkillNotes: string[];
  questionnaire: string[];
  rationale: string;
};

export type AgentBuilderClarification = {
  id: string;
  question: string;
  options: string[];
};

export type AgentBuilderTurn = {
  reply: string;
  questions: string[];
  clarifications: AgentBuilderClarification[];
  ready: boolean;
  draft: AgentBuilderDraft;
};

export const OTHER_OPTION_EN = "Other…";
export const OTHER_OPTION_ZH = "其他…";
