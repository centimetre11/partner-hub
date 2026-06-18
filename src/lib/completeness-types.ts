import type { Contact, Opportunity, Partner, TimelineEvent, Training } from "@prisma/client";

export type PartnerWithRelations = Partner & {
  contacts: Contact[];
  opportunities: Opportunity[];
  events: TimelineEvent[];
  trainings: Training[];
};
