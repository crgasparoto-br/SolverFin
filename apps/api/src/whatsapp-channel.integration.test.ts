import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
  claimFinancialAssistantTurn,
  getConversationById,
  startFinancialAssistantConversation,
} from "./financial-assistant-repository.js";
import type { ChannelInboundMessage, ChannelOutboundPort } from "./whatsapp-channel-provider.js";
import { handleWhatsappChannelWebhook } from "./whatsapp-channel-router.js";
import {
  acknowledgeWhatsappPairingCode,
  cancelWhatsappPairing,
  claimWhatsappInboundEvent,
  confirmWhatsappPairing,
  createWhatsappPairing,
  failWhatsappInboundEvent,
  finishWhatsappInboundEvent,
  isWhatsappLinkStillActive,
  listWhatsappLinks,
  redactExpiredWhatsappState,
  resolveActiveWhatsappLink,
  revokeWhatsappLink,
  withAuthorizedWhatsappOutbound,
  WhatsappChannelError,
} from "./whatsapp-channel-repository.js";
import {
  channelEventIdempotencyKey,
  deliverPersistedChannelReply,
  processInboundChannelMessage,
} from "./whatsapp-channel-service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "33333333-3333-4333-8333-333333333331";

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.name : "Unknown integration test error");
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const organization = (
    await query<{ organizationId: string }>(
      'select "organizationId" from "FinancialProfile" where "id"=$1',
      [PROFILE_ID],
    )
  )[0]?.organizationId;
  assert.ok(organization, "Seeded test profile is required.");

  const context: TenantContext = {
    userId: USER_ID,
    organizationId: organization,
    financialProfileId: PROFILE_ID,
    financialProfileKind: "personal",
  };
  const now = new Date();
  const suffix = BigInt("0x" + randomUUID().replace(/-/g, "").slice(0, 14)).toString();
  const accountId = "99" + suffix.slice(-12).padStart(12, "0");
  const senderId = "55" + suffix.slice(-10).padStart(10, "0");
  let interruptedConversationId: string | null = null;
  const outboundTexts: string[] = [];
  const outbound: ChannelOutboundPort = {
    async sendText(input) {
      assert.equal(input.accountId, accountId);
      assert.equal(input.recipientId, senderId);
      outboundTexts.push(input.text);
      return "wamid.integration-ack";
    },
  };

  const inbound = (id: string, receivedAt = now): ChannelInboundMessage => ({
    provider: "meta_whatsapp",
    accountId,
    senderId,
    externalMessageId: "wamid." + id,
    text: "qual o saldo do perfil autorizado em BRL?",
    receivedAt,
  });

  try {
    const pairing = await createWhatsappPairing(context, accountId, now);
    assert.equal(pairing.code.length, 32);
    const persisted = await query<{ challengeHash: string; senderId: string | null }>(
      'select "challengeHash","senderId" from "WhatsappChannelLink" where "id"=$1',
      [pairing.id],
    );
    assert.notEqual(persisted[0]?.challengeHash, pairing.code, "Pairing secret must be hashed.");
    assert.equal(persisted[0]?.senderId, null);

    assert.equal(
      await acknowledgeWhatsappPairingCode(
        accountId,
        senderId,
        pairing.code,
        new Date(now.getTime() + 1000),
      ),
      true,
    );
    const wrongContext = { ...context, financialProfileId: randomUUID() };
    await assert.rejects(
      () => confirmWhatsappPairing(wrongContext, pairing.id, new Date(now.getTime() + 2000)),
      { code: "WHATSAPP_LINK_NOT_AVAILABLE" },
    );
    const confirmed = await confirmWhatsappPairing(
      context,
      pairing.id,
      new Date(now.getTime() + 2000),
    );
    assert.equal(confirmed.state, "active");
    assert.match(confirmed.senderMasked, /\*{4}\d{4}$/);
    assert.equal(
      (await listWhatsappLinks(context)).some((item) => item.id === pairing.id),
      true,
    );

    const active = await resolveActiveWhatsappLink(accountId, senderId);
    assert.ok(active, "Link must resolve only with the configured account and sender.");
    assert.equal(active.userId, context.userId);
    assert.equal(active.financialProfileId, context.financialProfileId);
    assert.equal(await resolveActiveWhatsappLink(accountId, "550000000000"), null);
    assert.equal(await resolveActiveWhatsappLink("999999999", senderId), null);

    const msg = inbound(randomUUID());
    const attempts = await Promise.all([
      claimWhatsappInboundEvent(msg, new Date(now.getTime() + 3000)),
      claimWhatsappInboundEvent(msg, new Date(now.getTime() + 3000)),
    ]);
    assert.equal(attempts.filter((claim) => claim.token !== null).length, 1);
    const claimed = attempts.find((item) => item.token !== null);
    assert.ok(claimed?.token);
    await finishWhatsappInboundEvent(
      {
        eventId: claimed.event.id,
        token: claimed.token,
        outcome: "query_complete",
        reply: "Resultado de teste do assistente canônico.",
        link: active,
        conversationId: randomUUID(),
      },
      new Date(now.getTime() + 4000),
    );
    const recovered = await claimWhatsappInboundEvent(msg, new Date(now.getTime() + 5000));
    assert.equal(recovered.token, null);
    assert.equal(recovered.event.state, "response_ready");
    await deliverPersistedChannelReply(recovered.event, outbound);
    await deliverPersistedChannelReply(recovered.event, outbound);
    assert.deepEqual(outboundTexts, ["Resultado de teste do assistente canônico."]);
    const persistedDelivery = await query<{ state: string; replyText: string | null }>(
      'select "state","replyText" from "WhatsappChannelEvent" where "id"=$1',
      [claimed.event.id],
    );
    assert.equal(persistedDelivery[0]?.state, "sent");
    assert.equal(persistedDelivery[0]?.replyText, null);

    await assert.rejects(
      () => claimWhatsappInboundEvent({ ...msg, senderId: "559999000000" }),
      (error: unknown) =>
        error instanceof WhatsappChannelError && error.code === "WHATSAPP_EVENT_IDENTITY_CONFLICT",
      "a non-redacted message must not be replayed as a different sender",
    );

    // RESTART-IDEM-001: a crash happened after the assistant turn persisted,
    // but before its reply did. The same Meta POST must close safely, once.
    const interruptedQuestion = "Qual meu saldo projetado este mes em BRL?";
    const interruptedMessage: ChannelInboundMessage = {
      ...inbound(randomUUID()),
      text: interruptedQuestion,
    };
    const conversation = await startFinancialAssistantConversation(context);
    interruptedConversationId = conversation.conversation.id;

    // WhatsApp CANCELAR is a channel outcome, not an instruction to cancel
    // the same user's active conversation on the authenticated web app.
    const cancellationMessage = { ...inbound(randomUUID()), text: "CANCELAR" };
    const cancelReplyTexts: string[] = [];
    await processInboundChannelMessage(cancellationMessage, {
      async sendText(input) {
        cancelReplyTexts.push(input.text);
        return "wamid.channel-cancel-ack";
      },
    });
    const conversationAfterCancel = await getConversationById(
      context,
      conversation.conversation.id,
      true,
    );
    assert.equal(conversationAfterCancel?.conversation.status, conversation.conversation.status);
    assert.equal(cancelReplyTexts.length, 1);
    assert.match(cancelReplyTexts[0] ?? "", /conversa no SolverFin não foi alterada/);
    const channelCancellation = await query<{ outcome: string; state: string }>(
      `select "outcome","state" from "WhatsappChannelEvent"
       where "accountId"=$1 and "providerMessageId"=$2`,
      [accountId, cancellationMessage.externalMessageId],
    );
    assert.deepEqual(channelCancellation, [{ outcome: "cancelled", state: "sent" }]);

    const assistantKey = channelEventIdempotencyKey(interruptedMessage);
    const startedTurn = await claimFinancialAssistantTurn({
      context,
      conversationId: conversation.conversation.id,
      normalizedQuestion: interruptedQuestion,
      idempotencyKey: assistantKey,
      intent: "balance_projection",
      filters: {},
      now: new Date(Date.now() - 3 * 60_000),
    });
    assert.equal(startedTurn.kind, "claimed");
    const retryReplies: string[] = [];
    const retryOutbound: ChannelOutboundPort = {
      async sendText(input) {
        assert.equal(input.accountId, accountId);
        assert.equal(input.recipientId, senderId);
        retryReplies.push(input.text);
        return "wamid.recovered-safe-reply";
      },
    };
    await processInboundChannelMessage(interruptedMessage, retryOutbound);
    await processInboundChannelMessage(interruptedMessage, retryOutbound);
    assert.equal(retryReplies.length, 1, "same Meta event cannot emit a second response");
    assert.match(retryReplies[0] ?? "", /Não consegui concluir esta consulta/);
    const terminalAssistantTurns = await query<{
      status: string;
      failureCode: string | null;
      safeResponse: unknown;
    }>(
      `select "status", "failureCode", "safeResponse" from "FinancialAssistantTurn"
        where "conversationId"=$1 and "idempotencyKey"=$2`,
      [conversation.conversation.id, assistantKey],
    );
    assert.equal(terminalAssistantTurns.length, 1, "same-key retry cannot recalculate the turn");
    assert.equal(terminalAssistantTurns[0]?.status, "FAILED");
    assert.equal(terminalAssistantTurns[0]?.failureCode, "ASSISTANT_PROCESS_INTERRUPTED");
    assert.equal(terminalAssistantTurns[0]?.safeResponse, null);
    const terminalChannelEvents = await query<{ state: string; outcome: string }>(
      `select "state", "outcome" from "WhatsappChannelEvent"
        where "accountId"=$1 and "providerMessageId"=$2`,
      [accountId, interruptedMessage.externalMessageId],
    );
    assert.deepEqual(terminalChannelEvents, [{ state: "sent", outcome: "query_incomplete" }]);

    const failed = await claimWhatsappInboundEvent(inbound(randomUUID()));
    assert.ok(failed.token);
    await failWhatsappInboundEvent(failed.event.id, failed.token);
    const retried = await claimWhatsappInboundEvent({
      ...msg,
      externalMessageId: failed.event.providerMessageId,
    });
    assert.ok(retried.token, "same POST event can reclaim failure_retryable");
    await failWhatsappInboundEvent(retried.event.id, retried.token);

    const responseAfterRevoke = await claimWhatsappInboundEvent(inbound(randomUUID()));
    assert.ok(responseAfterRevoke.token);
    await finishWhatsappInboundEvent({
      eventId: responseAfterRevoke.event.id,
      token: responseAfterRevoke.token,
      outcome: "query_complete",
      reply: "DADO FINANCEIRO PRIVADO — NAO ENVIAR",
      link: active,
    });

    await withAuthorizedWhatsappOutbound(active, async () => "transport-approved");
    await revokeWhatsappLink(context, pairing.id);
    assert.equal(await isWhatsappLinkStillActive(active), false);
    assert.equal(await resolveActiveWhatsappLink(accountId, senderId), null);
    const replay = await claimWhatsappInboundEvent({
      ...msg,
      externalMessageId: responseAfterRevoke.event.providerMessageId,
    });
    await deliverPersistedChannelReply(replay.event, outbound);
    assert.equal(outboundTexts.length, 2);
    assert.doesNotMatch(outboundTexts.join(" "), /DADO FINANCEIRO PRIVADO/);

    const expiring = await createWhatsappPairing(
      context,
      accountId,
      new Date(now.getTime() - 11 * 60_000),
    );
    assert.equal(await acknowledgeWhatsappPairingCode(accountId, senderId, expiring.code), false);
    const cancelled = await createWhatsappPairing(context, accountId);
    await cancelWhatsappPairing(context, cancelled.id);
    assert.equal(await acknowledgeWhatsappPairingCode(accountId, senderId, cancelled.code), false);

    const stale = await claimWhatsappInboundEvent(
      inbound(randomUUID(), new Date(now.getTime() - 25 * 60 * 60_000)),
    );
    assert.equal(stale.event.state, "expired");
    assert.equal(stale.token, null);

    // A completed event keeps its provider ID but loses sender PII at TTL.
    // The same signed Meta event must remain an idempotent no-op, not return 503.
    await query('update "WhatsappChannelEvent" set "expiresAt"=$2 where "id"=$1', [
      claimed.event.id,
      new Date(Date.now() - 1000),
    ]);
    await redactExpiredWhatsappState();
    const redacted = await query<{
      senderId: string | null;
      state: string;
      replyText: string | null;
    }>('select "senderId","state","replyText" from "WhatsappChannelEvent" where "id"=$1', [
      claimed.event.id,
    ]);
    assert.equal(redacted[0]?.state, "sent");
    assert.equal(redacted[0]?.senderId, null);
    assert.equal(redacted[0]?.replyText, null);
    const afterRedaction = await claimWhatsappInboundEvent(msg);
    assert.equal(afterRedaction.token, null);
    assert.equal(afterRedaction.event.id, claimed.event.id);
    assert.equal(afterRedaction.event.state, "sent");
    assert.deepEqual(outboundTexts, [
      "Resultado de teste do assistente canônico.",
      "Para continuar, vincule este canal novamente no SolverFin.",
    ]);

    // BSUID-ONLY-REPLAY-001: a signed, padded WAMID with no phone must reach
    // the public webhook, persist its 131-character sender, and remain idempotent.
    const bsuid = "BR." + randomUUID().replace(/-/g, "").repeat(4);
    const bsuidPairing = await createWhatsappPairing(context, accountId);
    assert.equal(await acknowledgeWhatsappPairingCode(accountId, bsuid, bsuidPairing.code), true);
    assert.equal((await confirmWhatsappPairing(context, bsuidPairing.id)).state, "active");
    const bsuidReplies: string[] = [];
    let bsuidQueries = 0;
    const bsuidOutbound: ChannelOutboundPort = {
      async sendText(input) {
        assert.equal(input.recipientId, bsuid);
        bsuidReplies.push(input.text);
        return "wamid.bsuid-response==";
      },
    };
    const secret = "meta-only-integration-secret";
    const bsuidMessageId = "wamid." + randomUUID().replace(/-/g, "") + "==";
    const bsuidRaw = Buffer.from(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: accountId },
                  messages: [
                    {
                      id: bsuidMessageId,
                      from_user_id: bsuid,
                      type: "text",
                      text: { body: "CONSULTAR saldo autorizado" },
                      timestamp: String(Math.floor(Date.now() / 1000)),
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
    const handleBsuid = async () =>
      handleWhatsappChannelWebhook(
        {
          method: "POST",
          query: new URLSearchParams(),
          headers: {
            "x-hub-signature-256":
              "sha256=" + createHmac("sha256", secret).update(bsuidRaw).digest("hex"),
          },
          rawBody: bsuidRaw,
        },
        {
          env: {
            WHATSAPP_META_APP_SECRET: secret,
            WHATSAPP_META_VERIFY_TOKEN: "bsuid-test-token",
            WHATSAPP_META_PHONE_NUMBER_ID: accountId,
          },
          outbound: bsuidOutbound,
          processMessage: (received, port) =>
            processInboundChannelMessage(received, port, {
              queryFinancial: async (authorizedContext) => {
                assert.equal(authorizedContext.financialProfileId, context.financialProfileId);
                bsuidQueries++;
                return { conversationId: randomUUID(), answer: "Resposta segura BSUID" };
              },
            }),
        },
      );
    assert.equal((await handleBsuid()).statusCode, 200);
    assert.equal((await handleBsuid()).statusCode, 200);
    assert.equal(bsuidQueries, 1, "same signed WAMID must not query twice");
    assert.deepEqual(bsuidReplies, ["Resposta segura BSUID"]);
    const bsuidEvents = await query<{ senderId: string; state: string; outcome: string }>(
      `select "senderId","state","outcome" from "WhatsappChannelEvent"
       where "accountId"=$1 and "providerMessageId"=$2`,
      [accountId, bsuidMessageId],
    );
    assert.deepEqual(bsuidEvents, [{ senderId: bsuid, state: "sent", outcome: "query_complete" }]);
    await revokeWhatsappLink(context, bsuidPairing.id);
    assert.equal(await resolveActiveWhatsappLink(accountId, bsuid), null);

    const expired = await query<{ challengeHash: string | null; state: string }>(
      'select "challengeHash","state" from "WhatsappChannelLink" where "id"=$1',
      [expiring.id],
    );
    assert.deepEqual(expired[0], { challengeHash: null, state: "expired" });
  } finally {
    await query('delete from "WhatsappChannelEvent" where "accountId"=$1', [accountId]);
    await query('delete from "WhatsappChannelLink" where "accountId"=$1', [accountId]);
    if (interruptedConversationId !== null) {
      await query('delete from "FinancialAssistantTurn" where "conversationId"=$1', [
        interruptedConversationId,
      ]);
      await query('delete from "FinancialAssistantConversation" where "id"=$1', [
        interruptedConversationId,
      ]);
    }
  }
}
