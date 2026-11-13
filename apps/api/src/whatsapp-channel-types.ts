export type ChannelOutcome =
  | "awaiting_link"
  | "awaiting_confirmation"
  | "awaiting_selection"
  | "query_complete"
  | "query_incomplete"
  | "capture_pending_review"
  | "capture_incomplete"
  | "cancelled"
  | "unsupported";

export interface ChannelEventRow {
  id: string;
  provider: string;
  accountId: string;
  providerMessageId: string;
  senderId: string | null;
  linkId: string | null;
  userId: string | null;
  organizationId: string | null;
  financialProfileId: string | null;
  assistantConversationId: string | null;
  suggestionId: string | null;
  importBatchId: string | null;
  state:
    | "received"
    | "processing"
    | "failure_retryable"
    | "response_ready"
    | "sending"
    | "sent"
    | "send_unknown"
    | "expired"
    | "cancelled";
  outcome: ChannelOutcome | null;
  version: number;
  attempts: number;
  leaseToken: string | null;
  leaseUntil: Date | null;
  replyText: string | null;
  outboundProviderMessageId: string | null;
  expiresAt: Date;
  receivedAt: Date;
}

export interface ChannelEventClaim {
  event: ChannelEventRow;
  token: string | null;
}
