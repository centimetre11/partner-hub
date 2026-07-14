export type SplitProposalItem = {
  itemId: string;
  partnerId: string;
  partnerName: string;
  segmentText: string;
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  todos: { title: string; detail?: string; dueDate?: string | null }[];
};

export type SplitProposal = {
  meetingId: string;
  items: SplitProposalItem[];
  unassignedText: string;
};
