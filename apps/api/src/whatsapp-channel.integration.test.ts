import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import type { ChannelInboundMessage, ChannelOutboundPort } from "./whatsapp-channel-provider.js";
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
import { deliverPersistedChannelReply } from "./whatsapp-channel-service.js";

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
    const redacted = await query<{ senderId: string | null; state: string; replyText: string | null }>(
      'select "senderId","state","replyText" from "WhatsappChannelEvent" where "id"=$1',
      [claimed.event.id],
    );
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

    const expired = await query<{ challengeHash: string | null; state: string }>(
      'select "challengeHash","state" from "WhatsappChannelLink" where "id"=$1',
      [expiring.id],
    );
    assert.deepEqual(expired[0], { challengeHash: null, state: "expired" });
  } finally {
    await query('delete from "WhatsappChannelEvent" where "accountId"=$1', [accountId]);
    await query('delete from "WhatsappChannelLink" where "accountId"=$1', [accountId]);
  }
}
