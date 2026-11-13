import { createHash } from "node:crypto";

import { createAiProviderFromEnvironment } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { createBankMessageInboxWithAiForContext } from "./bank-message-ai-inbox.js";
import { cancelFinancialAssistantConversation } from "./financial-assistant-repository.js";
import {
  getOrStartFinancialAssistantConversation,
  sendFinancialAssistantMessage,
} from "./financial-assistant-service.js";
import {
  resolveAiProcessingConsentForContext,
  resolveBankMessageAiConsentForContext,
} from "./repositories/ai-consent.js";
import {
  acknowledgeWhatsappPairingCode,
  claimWhatsappInboundEvent,
  claimWhatsappOutboundEvent,
  contextFromChannelLink,
  failWhatsappInboundEvent,
  finishWhatsappInboundEvent,
  isWhatsappLinkStillActive,
  replaceResponseAfterRevocation,
  resolveActiveWhatsappLink,
  settleWhatsappOutboundEvent,
  withAuthorizedWhatsappOutbound,
  type ActiveChannelLink,
  type ChannelEventRow,
  type ChannelOutcome,
  WhatsappChannelError,
  WhatsappChannelLimits,
} from "./whatsapp-channel-repository.js";
import {
  ChannelProviderError,
  type ChannelInboundMessage,
  type ChannelOutboundPort,
} from "./whatsapp-channel-provider.js";

const UNLINKED_MESSAGE =
  "Para usar o SolverFin neste canal, inicie e confirme o vínculo no aplicativo autenticado.";
const REVOKED_MESSAGE = "Para continuar, vincule este canal novamente no SolverFin.";
const CAPTURE_REVIEW_MESSAGE =
  "Recebi a mensagem para revisão na Inbox do SolverFin. Nenhum lançamento foi criado ou aprovado.";
const CONSENT_MESSAGE =
  "Autorize o processamento de mensagens bancárias no SolverFin antes de usar a captura.";
const UNSUPPORTED_MESSAGE =
  "Envie uma pergunta financeira, CAPTURAR seguido da mensagem bancária, ou CANCELAR.";

interface ProcessedChannelReply {
  outcome: ChannelOutcome;
  reply: string;
  link?: ActiveChannelLink;
  conversationId?: string;
  suggestionId?: string;
  importBatchId?: string;
}

export interface ChannelServiceDependencies {
  claimInbound: typeof claimWhatsappInboundEvent;
  finishInbound: typeof finishWhatsappInboundEvent;
  failInbound: typeof failWhatsappInboundEvent;
  acknowledgePairing: typeof acknowledgeWhatsappPairingCode;
  resolveLink: typeof resolveActiveWhatsappLink;
  isLinkActive: typeof isWhatsappLinkStillActive;
  replaceRevoked: typeof replaceResponseAfterRevocation;
  claimOutbound: typeof claimWhatsappOutboundEvent;
  settleOutbound: typeof settleWhatsappOutboundEvent;
  authorizeSend: typeof withAuthorizedWhatsappOutbound;
  queryFinancial: (
    context: TenantContext,
    question: string,
    idempotencyKey: string,
    eventId: string,
    link: ActiveChannelLink,
  ) => Promise<{ conversationId: string; answer: string }>;
  captureFinancial: (
    context: TenantContext,
    rawMessage: string,
    eventId: string,
    link: ActiveChannelLink,
  ) => Promise<
    { suggestionId?: string; importBatchId?: string; pendingReview: boolean } | "consent_required"
  >;
  cancelFinancial: (context: TenantContext) => Promise<void>;
}

const defaultDependencies: ChannelServiceDependencies = {
  claimInbound: claimWhatsappInboundEvent,
  finishInbound: finishWhatsappInboundEvent,
  failInbound: failWhatsappInboundEvent,
  acknowledgePairing: acknowledgeWhatsappPairingCode,
  resolveLink: resolveActiveWhatsappLink,
  isLinkActive: isWhatsappLinkStillActive,
  replaceRevoked: replaceResponseAfterRevocation,
  claimOutbound: claimWhatsappOutboundEvent,
  settleOutbound: settleWhatsappOutboundEvent,
  authorizeSend: withAuthorizedWhatsappOutbound,
  queryFinancial: async (context, question, idempotencyKey, eventId, link) => {
    const conversation = await getOrStartFinancialAssistantConversation(context);
    const view = await sendFinancialAssistantMessage({
      context,
      conversationId: conversation.conversation.id,
      question,
      idempotencyKey,
      runtime: {
        selectProvider: () => createAiProviderFromEnvironment(process.env),
        resolveConsent: async () =>
          (await isWhatsappLinkStillActive(link))
            ? resolveAiProcessingConsentForContext(context)
            : "revoked",
        correlationId: eventId,
      },
    });
    const turn = view.turns.find((candidate) => candidate.idempotencyKey === idempotencyKey);
    if (!turn?.safeResponse?.answer || turn.status === "PROCESSING") {
      throw new WhatsappChannelError("WHATSAPP_ASSISTANT_NOT_READY", 503);
    }
    return { conversationId: view.conversation.id, answer: turn.safeResponse.answer };
  },
  captureFinancial: async (context, text, eventId, link) => {
    if (
      !(await isWhatsappLinkStillActive(link)) ||
      (await resolveBankMessageAiConsentForContext(context)) !== "granted"
    ) {
      return "consent_required";
    }
    const item = await createBankMessageInboxWithAiForContext(
      context,
      { origin: "whatsapp", text, consentAccepted: true },
      {
        correlationId: eventId,
        resolveConsent: async (current) =>
          (await isWhatsappLinkStillActive(link))
            ? resolveBankMessageAiConsentForContext(current)
            : "revoked",
      },
    );
    return {
      ...(item.suggestion?.id ? { suggestionId: item.suggestion.id } : {}),
      importBatchId: item.id,
      pendingReview: item.suggestion !== undefined && item.status === "pending_review",
    };
  },
  cancelFinancial: async (context) => {
    // Cancelling the conversational context never cancels a financial transaction.
    const conversation = await getOrStartFinancialAssistantConversation(context);
    await cancelFinancialAssistantConversation(context, conversation.conversation.id);
  },
};

function dependenciesFor(
  overrides: Partial<ChannelServiceDependencies>,
): ChannelServiceDependencies {
  return { ...defaultDependencies, ...overrides };
}

export function channelEventIdempotencyKey(message: ChannelInboundMessage): string {
  return (
    "wa-" +
    createHash("sha256")
      .update(message.provider)
      .update(":")
      .update(message.accountId)
      .update(":")
      .update(message.externalMessageId)
      .digest("hex")
  );
}

/** Never infer authorization from a phone number or inbound text. */
export async function processInboundChannelMessage(
  message: ChannelInboundMessage,
  outbound: ChannelOutboundPort,
  overrides: Partial<ChannelServiceDependencies> = {},
): Promise<void> {
  const dependencies = dependenciesFor(overrides);
  const claim = await dependencies.claimInbound(message);
  if (claim.token === null) {
    if (claim.event.state === "response_ready") {
      await deliverPersistedChannelReply(claim.event, outbound, dependencies);
      return;
    }
    if (claim.event.state === "processing" || claim.event.state === "failure_retryable") {
      // Meta retries the original signed POST; no GET or in-memory queue can resume raw input.
      throw new WhatsappChannelError("WHATSAPP_EVENT_PROCESSING", 503);
    }
    // SENT, EXPIRED, CANCELLED, SENDING or SEND_UNKNOWN: no new logical processing
    // and no duplicate outgoing message, even after process restart.
    return;
  }

  let reply: ProcessedChannelReply;
  try {
    reply = await decideChannelReply(message, claim.event.id, dependencies);
    if (reply.link && !(await dependencies.isLinkActive(reply.link))) {
      reply = { outcome: "awaiting_link", reply: REVOKED_MESSAGE };
    }
    await dependencies.finishInbound({
      eventId: claim.event.id,
      token: claim.token,
      outcome: reply.outcome,
      reply: reply.reply,
      ...(reply.link ? { link: reply.link } : {}),
      ...(reply.conversationId ? { conversationId: reply.conversationId } : {}),
      ...(reply.suggestionId ? { suggestionId: reply.suggestionId } : {}),
      ...(reply.importBatchId ? { importBatchId: reply.importBatchId } : {}),
    });
  } catch {
    // Only a replay of this provider event carries the raw message again.
    // Do not store or log it, and never trigger processing from a health-check.
    await dependencies.failInbound(claim.event.id, claim.token).catch(() => undefined);
    throw new WhatsappChannelError("WHATSAPP_EVENT_RETRY_REQUIRED", 503);
  }
  const current = { ...claim.event, state: "response_ready" as const };
  await deliverPersistedChannelReply(current, outbound, dependencies);
}

async function decideChannelReply(
  message: ChannelInboundMessage,
  eventId: string,
  deps: ChannelServiceDependencies,
): Promise<ProcessedChannelReply> {
  const text = message.text?.trim();
  if (!text || text.length > WhatsappChannelLimits.maxMessageChars) {
    return { outcome: "unsupported", reply: UNSUPPORTED_MESSAGE };
  }
  const pairing = /^VINCULAR\s+([A-Za-z0-9_-]{32})$/i.exec(text);
  if (pairing) {
    await deps.acknowledgePairing(message.accountId, message.senderId, pairing[1]!);
    // Deliberately identical for valid and invalid codes to prevent enumeration.
    return {
      outcome: "awaiting_confirmation",
      reply: "Solicitação recebida. Se você iniciou o vínculo, confirme no SolverFin.",
    };
  }
  const link = await deps.resolveLink(message.accountId, message.senderId);
  if (!link) return { outcome: "awaiting_link", reply: UNLINKED_MESSAGE };
  const context = contextFromChannelLink(link);

  if (/^CANCELAR$/i.test(text)) {
    await deps.cancelFinancial(context);
    return {
      outcome: "cancelled",
      reply: "Conversa encerrada. Nenhum registro financeiro foi alterado.",
      link,
    };
  }
  if (/^CAPTURAR(?:\s+|$)/i.test(text)) {
    const rawMessage = text.replace(/^CAPTURAR(?:\s+|$)/i, "").trim();
    if (!rawMessage) return { outcome: "capture_incomplete", reply: UNSUPPORTED_MESSAGE, link };
    const captured = await deps.captureFinancial(context, rawMessage, eventId, link);
    if (captured === "consent_required") {
      return { outcome: "capture_incomplete", reply: CONSENT_MESSAGE, link };
    }
    return {
      outcome: captured.pendingReview ? "capture_pending_review" : "capture_incomplete",
      reply: captured.pendingReview
        ? CAPTURE_REVIEW_MESSAGE
        : "Recebi o pedido, mas não há sugestão estruturada para revisar. Confira a Inbox do SolverFin; nenhum lançamento foi criado.",
      link,
      ...(captured.suggestionId ? { suggestionId: captured.suggestionId } : {}),
      ...(captured.importBatchId ? { importBatchId: captured.importBatchId } : {}),
    };
  }
  const question = text.replace(/^CONSULTAR\s+/i, "").trim();
  if (!question) return { outcome: "unsupported", reply: UNSUPPORTED_MESSAGE, link };
  const answer = await deps.queryFinancial(
    context,
    question,
    channelEventIdempotencyKey(message),
    eventId,
    link,
  );
  return {
    outcome: "query_complete",
    reply: answer.answer,
    link,
    conversationId: answer.conversationId,
  };
}

function isFinancialOutcome(outcome: ChannelOutcome | null): boolean {
  return (
    outcome === "query_complete" ||
    outcome === "capture_pending_review" ||
    outcome === "capture_incomplete"
  );
}

/** A response is stored before outbound, so a crash/replay never recalculates the ledger. */
export async function deliverPersistedChannelReply(
  event: ChannelEventRow,
  outbound: ChannelOutboundPort,
  dependencies: ChannelServiceDependencies = defaultDependencies,
): Promise<void> {
  if (event.state !== "response_ready") return;
  if (isFinancialOutcome(event.outcome)) {
    const link = event.senderId
      ? await dependencies.resolveLink(event.accountId, event.senderId)
      : null;
    if (
      !link ||
      link.id !== event.linkId ||
      link.userId !== event.userId ||
      link.organizationId !== event.organizationId ||
      link.financialProfileId !== event.financialProfileId ||
      !(await dependencies.isLinkActive(link))
    ) {
      await dependencies.replaceRevoked(event.id);
    }
  }
  const claimed = await dependencies.claimOutbound(event.id);
  if (!claimed) return; // Another worker owns send or it has already been sent.
  const to = claimed.event.senderId;
  const body = claimed.event.replyText;
  if (!to || !body) {
    await dependencies.settleOutbound(event.id, claimed.token, "send_unknown", null);
    return;
  }

  // Recheck the same persisted scope immediately before any external data leaves.
  let authorizationLink: ActiveChannelLink | undefined;
  if (isFinancialOutcome(claimed.event.outcome)) {
    const link = await dependencies.resolveLink(claimed.event.accountId, to);
    if (
      !link ||
      link.id !== claimed.event.linkId ||
      link.userId !== claimed.event.userId ||
      link.organizationId !== claimed.event.organizationId ||
      link.financialProfileId !== claimed.event.financialProfileId ||
      !(await dependencies.isLinkActive(link))
    ) {
      await dependencies.settleOutbound(event.id, claimed.token, "send_unknown", null);
      return;
    }
    authorizationLink = link;
  }

  try {
    const payload = {
      accountId: claimed.event.accountId,
      recipientId: to,
      text: body,
    };
    const outboundId = authorizationLink
      ? await dependencies.authorizeSend(authorizationLink, () => outbound.sendText(payload))
      : await outbound.sendText(payload);
    await dependencies.settleOutbound(event.id, claimed.token, "sent", outboundId);
  } catch (error) {
    const safelyRetryable = error instanceof ChannelProviderError && error.knownNotSent;
    await dependencies.settleOutbound(
      event.id,
      claimed.token,
      safelyRetryable ? "response_ready" : "send_unknown",
      null,
    );
    if (safelyRetryable) throw new WhatsappChannelError("WHATSAPP_OUTBOUND_RETRY_REQUIRED", 503);
    // Ambiguous provider acceptance stays send_unknown, never re-sent blindly.
  }
}
