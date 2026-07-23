export type SplitProposalItem = {
  itemId: string;
  label: string;
  userId: string;
  customerId: string;
  projectId: string;
  segmentText: string;
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  projectWorkLogContent: string;
  todos: { title: string; detail?: string; dueDate?: string | null }[];
};

export type SplitProposal = {
  meetingId: string;
  items: SplitProposalItem[];
  unassignedText: string;
};
