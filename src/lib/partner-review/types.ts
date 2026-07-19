/** 会前简报结构（可在 client / server 共用） */
export type PartnerPrepBrief = {
  partnerId: string;
  partnerName: string;
  windowLabel: string;
  progress: {
    title: string;
    category: string;
    categoryLabel: string;
    occurredAt: string;
    contentPreview: string;
    contactName?: string | null;
  }[];
  timeline: { title: string; type: string; createdAt: string }[];
  /** 待办摘录：未完成 + 近两周已完成 */
  todos: {
    id: string;
    title: string;
    dueDate: string | null;
    overdue: boolean;
    priority: string;
    done: boolean;
  }[];
  /** @deprecated 兼容旧简报；新数据请用 todos */
  openTodos: { id: string; title: string; dueDate: string | null; overdue: boolean; priority: string }[];
  opportunities: {
    id: string;
    name: string;
    stage: string;
    amount: string | null;
    customerId?: string | null;
    customerName?: string | null;
    status?: string;
    statusLabel?: string;
  }[];
  /** 按终端客户分组的进行中商机 */
  customerOpportunities: {
    customerId: string;
    customerName: string;
    creditCode?: string | null;
    mossFitLevel?: "hot" | "warm" | "neutral" | "unknown" | null;
    mossSyncedAt?: string | null;
    opportunities: {
      id: string;
      name: string;
      stage: string;
      amount: string | null;
      status: string;
      statusLabel: string;
    }[];
  }[];
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

/** 确认入库时冻结的摘要，供历史回看 */
export type ConfirmedItemSnapshot = {
  confirmedAt: string;
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  skipBusinessRecord: boolean;
  wroteBusinessRecord: boolean;
  todos: {
    title: string;
    detail: string | null;
    dueDate: string | null;
    todoItemId?: string | null;
  }[];
};

export function parseConfirmedSnapshot(raw: string | null | undefined): ConfirmedItemSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConfirmedItemSnapshot;
  } catch {
    return null;
  }
}
