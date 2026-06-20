export function automationSaveErrorMessage(
  code: string,
  messages: {
    saveErrorDescription: string;
    saveErrorDelivery: string;
    saveErrorPartner: string;
    saveErrorSlug: string;
    saveErrorGeneric: string;
  }
): string {
  switch (code) {
    case "description_required":
      return messages.saveErrorDescription;
    case "delivery_required":
      return messages.saveErrorDelivery;
    case "partner_not_found":
      return messages.saveErrorPartner;
    case "slug_exists":
      return messages.saveErrorSlug;
    default:
      return messages.saveErrorGeneric;
  }
}
