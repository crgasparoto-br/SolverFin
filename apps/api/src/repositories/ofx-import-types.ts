import type { EntityId } from "@solverfin/domain";

export interface OfxImportPayload {
  originalFileName: string;
  content: string;
  accountId: EntityId;
  consentAccepted: true;
}

export interface OfxAccountRow {
  id: string;
  status: string;
  currency: string;
}
