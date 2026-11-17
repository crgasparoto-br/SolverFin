import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { FakeAiProvider, type AiProviderSelection } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { createBankMessageInboxWithAiForContext } from "./bank-message-ai-inbox.js";
import { closePool, query } from "./db.js";
import { renderWhatsappFinancialConfirmationReply } from "./whatsapp-channel-confirmation-outbound.js";
import {
  decideWhatsappFinancialConfirmation,
  prepareWhatsappFinancialConfirmation,
  WHATSAPP_CONFIRMATION_TTL_MS,
  WHATSAPP_CONFIRMATION_TOKEN_PLACEHOLDER,
} from "./whatsapp-channel-confirmation.js";
import type { ChannelInboundMessage, ChannelOutboundPort } from "./whatsapp-channel-provider.js";
import {
  acknowledgeWhatsappPairingCode,
  claimWhatsappInboundEvent,
  confirmWhatsappPairing,
  createWhatsappPairing,
  resolveActiveWhatsappLink,
  revokeWhatsappLink,
} from "./whatsapp-channel-repository.js";
import { processInboundChannelMessage } from "./whatsapp-channel-service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "33333333-3333-4333-8333-333333333331";

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : "Unknown integration error");
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "PostgreSQL test database is required.");
  const profile = (
    await query<{ organizationId: string }>(
      'select "organizationId" from "FinancialProfile" where "id"=$1',
      [PROFILE_ID],
    )
  )[0];
  assert.ok(profile);
  const account = (
    await query<{ id: string }>(
      'select "id" from "Account" where "financialProfileId"=$1 and "organizationId"=$2 and "status"=\'ACTIVE\' and "currency"=\'BRL\' limit 1',
      [PROFILE_ID, profile.organizationId],
    )
  )[0];
  assert.ok(account, "Active BRL account required in test seed");
  const context: TenantContext = {
    userId: USER_ID,
    financialProfileId: PROFILE_ID,
    organizationId: profile.organizationId,
    financialProfileKind: "personal",
  };
  const unique = randomUUID().replace(/-/g, "");
  const metaAccount = "97" + unique.slice(0, 12);
  const senderId = "55" + unique.slice(13, 24);
  const secret = "test-meta-confirmation-secret-not-for-production";
  const outboundTexts: string[] = [];
  const outbound: ChannelOutboundPort = {
    async sendText(message) {
      outboundTexts.push(message.text);
      return "wamid.outbound-" + outboundTexts.length;
    },
  };
  const incoming = (text: string): ChannelInboundMessage => ({
    provider: "meta_whatsapp",
    accountId: metaAccount,
    senderId,
    externalMessageId: "wamid." + randomUUID(),
    text,
    receivedAt: new Date(),
  });

  try {
    const pairing = await createWhatsappPairing(context, metaAccount);
    assert.equal(await acknowledgeWhatsappPairingCode(metaAccount, senderId, pairing.code), true);
    await confirmWhatsappPairing(context, pairing.id);
    const link = await resolveActiveWhatsappLink(metaAccount, senderId);
    assert.ok(link);
    const createSuggestion = async (label: string): Promise<string> => {
      const provider = new FakeAiProvider([
        {
          text: "structured",
          structured: {
            amountMinor: 2570,
            currency: "BRL",
            occurredOn: "2026-11-16",
            type: "expense",
            merchant: "Loja Sintética",
            confidence: 0.99,
            source: "bank_message",
            reasons: ["Fixture de teste"],
          },
        },
      ]);
      const selection: AiProviderSelection = {
        status: "ready",
        provider: provider as never,
        health: {
          status: "ready",
          providerId: "openai",
          model: provider.model,
          endpointOrigin: "https://example.invalid",
          issues: [],
        },
      };
      const intake = await createBankMessageInboxWithAiForContext(
        context,
        {
          origin: "whatsapp",
          text: "captura " + label + " " + randomUUID() + " sem dado real",
          consentAccepted: true,
          accountId: account.id,
        },
        {
          selectProvider: () => selection,
          resolveConsent: () => "granted",
        },
      );
      assert.ok(intake.suggestion, "Canonical Inbox must persist a structured review item");
      return intake.suggestion.id;
    };
    const sendProposal = async (
      suggestionId: string,
      preparationSecret = secret,
      deliverySecret = secret,
    ): Promise<{
      text: string;
      code: string;
      inbound: ChannelInboundMessage;
    }> => {
      const source = incoming("CAPTURAR notificação fictícia");
      await processInboundChannelMessage(source, outbound, {
        captureFinancial: async () => ({ pendingReview: true, suggestionId }),
        prepareConfirmation: (authorized, eventId, selectedId, activeLink) =>
          prepareWhatsappFinancialConfirmation(
            authorized,
            eventId,
            selectedId,
            activeLink,
            preparationSecret,
          ),
        renderConfirmation: async (event) => {
          const stored = await query<{ replyText: string | null }>(
            'select "replyText" from "WhatsappChannelEvent" where "id"=$1',
            [event.id],
          );
          const durableText = stored[0]?.replyText ?? "";
          assert.ok(
            durableText.includes(WHATSAPP_CONFIRMATION_TOKEN_PLACEHOLDER),
            "pending outbound must store only the marker, never the plaintext code",
          );
          assert.doesNotMatch(durableText, /CONFIRMAR [A-Za-z0-9_-]{12}/);
          const before = await query<{ tokenHash: string }>(
            'select "tokenHash" from "WhatsappChannelConfirmation" where "sourceEventId"=$1',
            [event.id],
          );
          const rendered = await renderWhatsappFinancialConfirmationReply(event, deliverySecret);
          const after = await query<{ tokenHash: string }>(
            'select "tokenHash" from "WhatsappChannelConfirmation" where "sourceEventId"=$1',
            [event.id],
          );
          if (preparationSecret !== deliverySecret) {
            assert.notEqual(
              before[0]?.tokenHash,
              after[0]?.tokenHash,
              "an unsent proposal must be re-keyed when the app secret rotates",
            );
          }
          return rendered;
        },
      });
      const text = outboundTexts.at(-1) ?? "";
      const code = /CONFIRMAR ([A-Za-z0-9_-]{12})/.exec(text)?.[1];
      assert.ok(code, "Explicit confirmation token must be persisted before outbound");
      return { text, code, inbound: source };
    };
    const assertNoEffect = async (suggestionId: string) => {
      const rows = await query<{ count: number }>(
        'select count(*)::int as "count" from "Transaction" where "aiSuggestionId"=$1',
        [suggestionId],
      );
      assert.equal(rows[0]?.count, 0);
    };

    const approvedSuggestion = await createSuggestion("approve");
    const source = await sendProposal(approvedSuggestion);
    const persisted = await query<{ status: string; tokenHash: string }>(
      'select "status","tokenHash" from "WhatsappChannelConfirmation" where "suggestionId"=$1',
      [approvedSuggestion],
    );
    assert.equal(persisted[0]?.status, "pending_confirmation");
    assert.notEqual(persisted[0]?.tokenHash, source.code);
    await assertNoEffect(approvedSuggestion);
    const sentBeforeReplay = outboundTexts.length;
    await processInboundChannelMessage(source.inbound, outbound, {
      captureFinancial: async () => {
        throw new Error("capture replay forbidden");
      },
    });
    assert.equal(outboundTexts.length, sentBeforeReplay);

    // The same token cannot be used from another financial profile.
    const wrong = await decideWhatsappFinancialConfirmation(
      { ...context, financialProfileId: randomUUID() },
      randomUUID(),
      "CONFIRMAR " + source.code,
      link,
    );
    assert.equal(wrong?.outcome, "confirmation_incomplete");
    await assertNoEffect(approvedSuggestion);

    // Concurrent decisions serialize on the durable confirmation row and canonical review lock.
    const confirmA = incoming("CONFIRMAR " + source.code);
    const confirmB = incoming("CONFIRMAR " + source.code);
    await Promise.all([
      processInboundChannelMessage(confirmA, outbound),
      processInboundChannelMessage(confirmB, outbound),
    ]);
    const approvedTransactions = await query<{ count: number }>(
      'select count(*)::int as "count" from "Transaction" where "aiSuggestionId"=$1',
      [approvedSuggestion],
    );
    assert.equal(approvedTransactions[0]?.count, 1);
    await processInboundChannelMessage(confirmA, outbound);
    // Exercise the same production entrypoint in a fresh Node runtime, not just
    // another call using the first process's database pool or module cache.
    const replayAfterRestart = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          `import { processInboundChannelMessage } from ${JSON.stringify(new URL("./whatsapp-channel-service.js", import.meta.url).href)};`,
          `import { closePool } from ${JSON.stringify(new URL("./db.js", import.meta.url).href)};`,
          "const message = JSON.parse(process.argv[1]);",
          "message.receivedAt = new Date(message.receivedAt);",
          "try {",
          "  await processInboundChannelMessage(message, {",
          '    async sendText() { process.stdout.write("DUPLICATE_OUTBOUND"); return "unexpected"; },',
          "  });",
          "} finally {",
          "  await closePool();",
          "}",
        ].join("\n"),
        JSON.stringify(confirmA),
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(replayAfterRestart.status, 0, replayAfterRestart.stderr);
    assert.doesNotMatch(
      replayAfterRestart.stdout,
      /DUPLICATE_OUTBOUND/,
      "restart replay must not send outbound",
    );
    assert.equal(
      (
        await query<{ count: number }>(
          'select count(*)::int as "count" from "Transaction" where "aiSuggestionId"=$1',
          [approvedSuggestion],
        )
      )[0]?.count,
      1,
      "replay after restart must never create a second transaction",
    );

    // Provider accepted the effect but its acknowledgement was lost: do not send twice.
    const uncertainId = await createSuggestion("outbound-unknown");
    const uncertainPrompt = await sendProposal(uncertainId);
    const uncertainEvent = incoming("CONFIRMAR " + uncertainPrompt.code);
    await processInboundChannelMessage(uncertainEvent, {
      async sendText() {
        throw new Error("simulated lost Meta acknowledgement after canonical commit");
      },
    });
    const unknownDelivery = await query<{ state: string }>(
      'select "state" from "WhatsappChannelEvent" where "providerMessageId"=$1',
      [uncertainEvent.externalMessageId],
    );
    assert.equal(unknownDelivery[0]?.state, "send_unknown");
    assert.equal(
      (
        await query<{ count: number }>(
          'select count(*)::int as "count" from "Transaction" where "aiSuggestionId"=$1',
          [uncertainId],
        )
      )[0]?.count,
      1,
    );
    const outboundCount = outboundTexts.length;
    await processInboundChannelMessage(uncertainEvent, outbound);
    assert.equal(outboundTexts.length, outboundCount, "unknown Meta acceptance is not resent");
    assert.equal(
      (
        await query<{ count: number }>(
          'select count(*)::int as "count" from "Transaction" where "aiSuggestionId"=$1',
          [uncertainId],
        )
      )[0]?.count,
      1,
    );

    // Rotate the HMAC secret after preparation but before the first outbound.
    // The re-keyed token must be valid, and no capability is stored in cleartext.
    const rotatedId = await createSuggestion("rotated-secret-before-send");
    const rotated = await sendProposal(rotatedId, secret, secret + "-rotated");
    await processInboundChannelMessage(incoming("CONFIRMAR " + rotated.code), outbound);
    assert.equal(
      (
        await query<{ count: number }>(
          'select count(*)::int as "count" from "Transaction" where "aiSuggestionId"=$1',
          [rotatedId],
        )
      )[0]?.count,
      1,
      "confirmation after pre-send secret rotation must use the re-keyed token",
    );

    // Conflicting concurrent actions serialize: confirmed XOR rejected, never both.
    const conflictId = await createSuggestion("confirm-reject-race");
    const racePrompt = await sendProposal(conflictId);
    await Promise.all([
      processInboundChannelMessage(incoming("CONFIRMAR " + racePrompt.code), outbound),
      processInboundChannelMessage(incoming("REJEITAR " + racePrompt.code), outbound),
    ]);
    const raceStatus = (
      await query<{ status: string }>(
        'select "status" from "WhatsappChannelConfirmation" where "suggestionId"=$1',
        [conflictId],
      )
    )[0]?.status;
    assert.ok(raceStatus === "confirmed" || raceStatus === "rejected");
    assert.equal(
      (
        await query<{ count: number }>(
          'select count(*)::int as "count" from "Transaction" where "aiSuggestionId"=$1',
          [conflictId],
        )
      )[0]?.count,
      raceStatus === "confirmed" ? 1 : 0,
    );
    // Exact action and token required; rejection and cancellation never write Transaction.
    for (const action of ["REJEITAR", "CANCELAR"] as const) {
      const id = await createSuggestion(action);
      const prompt = await sendProposal(id);
      await processInboundChannelMessage(incoming(action + " " + prompt.code), outbound);
      await assertNoEffect(id);
      assert.equal(
        (
          await query<{ status: string }>(
            'select "status" from "WhatsappChannelConfirmation" where "suggestionId"=$1',
            [id],
          )
        )[0]?.status,
        action === "REJEITAR" ? "rejected" : "cancelled",
      );
      const expectedSuggestionStatus = action === "REJEITAR" ? "rejected" : "pending_review";
      assert.equal(
        (
          await query<{ status: string }>(
            'select lower("status"::text) as "status" from "AiSuggestion" where "id"=$1',
            [id],
          )
        )[0]?.status,
        expectedSuggestionStatus,
      );
    }

    const expiredId = await createSuggestion("expired");
    const expiring = await sendProposal(expiredId);
    // A decision is always correlated to an existing signed provider event.
    // Register that event before exercising an artificial future TTL.
    const expiredDecision = await claimWhatsappInboundEvent(incoming("CONFIRMAR " + expiring.code));
    assert.ok(expiredDecision.token);
    const response = await decideWhatsappFinancialConfirmation(
      context,
      expiredDecision.event.id,
      "CONFIRMAR " + expiring.code,
      link,
      new Date(Date.now() + WHATSAPP_CONFIRMATION_TTL_MS + 60_000),
    );
    assert.equal(response?.outcome, "confirmation_incomplete");
    await assertNoEffect(expiredId);
    assert.equal(
      (
        await query<{ status: string }>(
          'select "status" from "WhatsappChannelConfirmation" where "suggestionId"=$1',
          [expiredId],
        )
      )[0]?.status,
      "expired",
    );

    await revokeWhatsappLink(context, pairing.id);
    const revoked = await decideWhatsappFinancialConfirmation(
      context,
      randomUUID(),
      "CONFIRMAR " + source.code,
      link,
    );
    assert.equal(revoked?.outcome, "confirmation_incomplete");
  } finally {
    // Only channel journal rows created with this unique Meta account are removed.
    await query(
      'delete from "WhatsappChannelConfirmation" where "linkId" in (select "id" from "WhatsappChannelLink" where "accountId"=$1)',
      [metaAccount],
    );
    await query('delete from "WhatsappChannelEvent" where "accountId"=$1', [metaAccount]);
    await query('delete from "WhatsappChannelLink" where "accountId"=$1', [metaAccount]);
    // Canonical Inbox/review/transactions are reset by the integration database setup.
  }
}
