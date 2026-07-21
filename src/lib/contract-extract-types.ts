/** Client-safe types for CRM contract screenshot extraction. */

import type { AmountCurrency } from "./amount";
import type { BillingCycleCode, ContractStatusCode, ContractTypeCode } from "./contract-types";
import type { ContractLineItemInput } from "./contract-line-items";

export type ContractExtractResult = {
  name?: string;
  customerName?: string;
  contractType?: ContractTypeCode;
  status?: ContractStatusCode;
  amount?: string;
  currency?: AmountCurrency;
  crmContractId?: string;
  billingCycle?: BillingCycleCode;
  /** Years the contract amount covers (multi-year subscription). */
  termYears?: number;
  startDate?: string;
  endDate?: string;
  renewsAt?: string;
  salesOwnerName?: string;
  notes?: string;
  lineItems?: ContractLineItemInput[];
};
