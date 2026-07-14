/** 会前简报结构（可在 client / server 共用） */
export type PartnerPrepBrief = {
  partnerId: string;
  partnerName: string;
  windowLabel: string;
  progress: { title: string; category: string; occurredAt: string; contentPreview: string }[];
  timeline: { title: string; type: string; createdAt: string }[];
  openTodos: { id: string; title: string; dueDate: string | null; overdue: boolean; priority: string }[];
  opportunities: { id: string; name: string; stage: string; amount: string | null }[];
  aiTopics: string[];
  summaryLine: string;
};

export type ConfirmItemPayload = {
  itemId: string;
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  skipBusinessRecord?: boolean;
  todos: {
    id?: string;
    title: string;
    detail?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
    include: boolean;
  }[];
};
