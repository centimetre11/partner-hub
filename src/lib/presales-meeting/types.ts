export type RecommendedAgendaItem = {
  userId: string;
  /** PROJECT | OPPORTUNITY | CUSTOMER */
  kind: "PROJECT" | "OPPORTUNITY" | "CUSTOMER";
  subjectKey: string;
  /** 列表展示标题 */
  title: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  /** 命中原因：商务记录 / 待办 / 项目工作记录 */
  reasons: string[];
};

export type ConfirmTodoPayload = {
  id?: string;
  title: string;
  detail?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  include: boolean;
};

export type ConfirmItemPayload = {
  itemId: string;
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  skipBusinessRecord?: boolean;
  projectWorkLogContent: string;
  skipProjectWorkLog?: boolean;
  todos: ConfirmTodoPayload[];
};

export type ConfirmedItemSnapshot = {
  confirmedAt: string;
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  skipBusinessRecord: boolean;
  wroteBusinessRecord: boolean;
  projectWorkLogContent: string;
  skipProjectWorkLog: boolean;
  wroteProjectWorkLog: boolean;
  todos: {
    title: string;
    detail: string | null;
    dueDate: string | null;
    todoItemId: string | null;
  }[];
};

export type PrepFacts = {
  openTodos: {
    id: string;
    title: string;
    dueDate: string | null;
    assigneeName: string | null;
  }[];
  businessRecords: {
    id: string;
    title: string;
    content: string | null;
    occurredAt: string;
    category: string;
  }[];
  workLogs: {
    id: string;
    content: string;
    createdAt: string;
    authorName: string | null;
  }[];
};

export function parseConfirmedSnapshot(raw: string | null): ConfirmedItemSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConfirmedItemSnapshot;
  } catch {
    return null;
  }
}

export { itemDisplayLabel, type AgendaSubjectKind } from "./subject";
