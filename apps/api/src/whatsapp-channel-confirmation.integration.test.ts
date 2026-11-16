import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { FakeAiProvider, type AiProviderSelection } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { createBankMessageInboxWithAiForContext } from "./bank-message-ai-inbox.js";
import { closePool, query } from "./db.js";
import {
  decideWhatsappFinancialConfirmation,
  prepareWhatsappFinancialConfirmation,
  WHATSAPP_CONFIRMATION_TTL_MS,
} from "./whatsapp-channel-confirmation.js";
import type { ChannelInboundMessage, ChannelOutboundPort } from "./whatsapp-channel-provider.js";
import {
  acknowledgeWhatsappPairingCode,
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
    ): Promise<{
      text: string;
      code: string;
      inbound: ChannelInboundMessage;
    }> => {
      const source = incoming("CAPTURAR notificação fictícia");
      await processInboundChannelMessage(source, outbound, {
        captureFinancial: async () => ({ pendingReview: true, suggestionId }),
        prepareConfirmation: (authorized, eventId, selectedId, activeLink) =>
          prepareWhatsappFinancialConfirmation(authorized, eventId, selectedId, activeLink, secret),
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
    const response = await decideWhatsappFinancialConfirmation(
      context,
      randomUUID(),
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
