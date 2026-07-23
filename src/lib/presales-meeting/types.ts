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

export function itemDisplayLabel(opts: {
  userName: string;
  customerName: string;
  projectName: string;
}): string {
  return `${opts.userName} · ${opts.customerName} / ${opts.projectName}`;
}
