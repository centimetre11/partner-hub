export function automationSaveErrorMessage(
  code: string,
  messages: {
    saveErrorDescription: string;
    saveErrorDelivery: string;
    saveErrorPartner: string;
    saveErrorSlug: string;
    saveErrorGeneric: string;
    saveErrorCustomer?: string;
    saveErrorScopePartner?: string;
    saveErrorScopeCustomer?: string;
    saveErrorAiGoal?: string;
  }
): string {
  switch (code) {
    case "description_required":
    case "goal_required":
      return messages.saveErrorAiGoal ?? messages.saveErrorDescription;
    case "delivery_required":
      return messages.saveErrorDelivery;
    case "partner_required":
      return messages.saveErrorScopePartner ?? messages.saveErrorPartner;
    case "customer_required":
      return messages.saveErrorScopeCustomer ?? messages.saveErrorGeneric;
    case "partner_not_found":
      return messages.saveErrorPartner;
    case "customer_not_found":
      return messages.saveErrorCustomer ?? messages.saveErrorGeneric;
    case "slug_exists":
      return messages.saveErrorSlug;
    default:
      return messages.saveErrorGeneric;
  }
}
