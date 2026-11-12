import type { AiSuggestion } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";
import {
  BankMessageInboxError,
  buildBankMessageSourceHash,
  createBankMessageInboxItem,
  discardBankMessageInboxItem,
  getBankMessageInboxItem,
  listBankMessageInboxItems,
  markBankMessageInboxItemError,
  markBankMessageInboxItemProcessed,
  maskBankMessageText,
} from "./bank-message-inbox.js";

const tenantA: TenantContext = {
  userId: "user-inbox-a",
  organizationId: "org-inbox-a",
  financialProfileId: "profile-inbox-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-inbox-b",
  organizationId: "org-inbox-b",
  financialProfileId: "profile-inbox-b",
  financialProfileKind: "business",
};

const now = "2026-06-16T12:00:00.000Z";
const later = "2026-06-16T12:05:00.000Z";

testCreatePastedMessage();
testDuplicateMessage();
testInvalidPayloads();
testMessageStatusTransitions();
testTenantIsolation();
testMasking();

function testCreatePastedMessage(): void {
  const result = createBankMessageInboxItem({
    id: "message-1",
    context: tenantA,
    now,
    payload: {
      origin: "pasted",
      text: "Banco Demo: compra aprovada no cartao 1234567890123456 em Mercado Demo R$ 42,50",
    },
  });

  assertEqual(result.item.status, "pending", "created status");
  assertEqual(result.item.origin, "pasted", "created origin");
  assertEqual(result.item.organizationId, tenantA.organizationId, "created organization scope");
  assertEqual(result.item.financialProfileId, tenantA.financialProfileId, "created profile scope");
  assertEqual(result.item.rawText.includes("1234567890123456"), true, "raw text preserved");
  assertEqual(result.item.maskedText.includes("************3456"), true, "masked text card");
  assertEqual(result.auditEntry.entityKind, "bank_message", "audit entity kind");
  assertEqual(result.auditEntry.redactedChanges?.rawText, "changed", "audit redacts raw text");
}

function testDuplicateMessage(): void {
  const text = "Pix recebido de Cliente Demo conta 123456 valor R$ 100,00";
  const sourceHash = buildBankMessageSourceHash(tenantA, text);

  assertBankMessageError(
    () =>
      createBankMessageInboxItem({
        id: "message-duplicate",
        context: tenantA,
        now,
        existingSourceHashes: [sourceHash],
        payload: {
          origin: "shared",
          text,
        },
      }),
    "BANK_MESSAGE_DUPLICATE",
  );
}

function testInvalidPayloads(): void {
  assertBankMessageError(
    () =>
      createBankMessageInboxItem({
        id: "message-empty",
        context: tenantA,
        now,
        payload: {
          origin: "pasted",
          text: "   ",
        },
      }),
    "BANK_MESSAGE_TEXT_EMPTY",
  );

  assertBankMessageError(
    () =>
      createBankMessageInboxItem({
        id: "message-large",
        context: tenantA,
        now,
        maxTextLength: 10,
        payload: {
          origin: "shared",
          text: "Mensagem bancaria ficticia acima do limite",
        },
      }),
    "BANK_MESSAGE_TEXT_TOO_LARGE",
  );
}

function testMessageStatusTransitions(): void {
  const created = createBankMessageInboxItem({
    id: "message-transition",
    context: tenantA,
    now,
    payload: {
      origin: "shared",
      text: "Banco Demo informa compra de R$ 89,90 em Padaria Demo",
    },
  }).item;

  const errored = markBankMessageInboxItemError({
    context: tenantA,
    item: created,
    now: later,
    errorCode: "PARSER_NOT_READY",
    errorMessage: "Processamento automatico ainda nao disponivel.",
  }).item;

  assertEqual(errored.status, "error", "errored status");
  assertEqual(errored.errorCode, "PARSER_NOT_READY", "errored code");

  const suggestion = buildSuggestion("suggestion-transition");
  const processed = markBankMessageInboxItemProcessed({
    context: tenantA,
    item: errored,
    now: later,
    suggestion,
  }).item;

  assertEqual(processed.status, "processed", "processed status");
  assertEqual(processed.linkedSuggestionId, suggestion.id, "processed suggestion link");
  assertEqual(processed.errorCode, undefined, "processed clears error code");

  const discarded = discardBankMessageInboxItem({
    context: tenantA,
    item: processed,
    now: later,
    reason: "Mensagem revisada manualmente.",
  });

  assertEqual(discarded.item.status, "discarded", "discarded status");
  assertEqual(discarded.auditEntry.reason, "Mensagem revisada manualmente.", "discard reason");
}

function testTenantIsolation(): void {
  const itemA = createBankMessageInboxItem({
    id: "message-tenant-a",
    context: tenantA,
    now,
    payload: {
      origin: "pasted",
      text: "Banco Demo: pagamento de boleto 1234567890",
    },
  }).item;
  const itemB = createBankMessageInboxItem({
    id: "message-tenant-b",
    context: tenantB,
    now,
    payload: {
      origin: "shared",
      text: "Banco Demo: transferencia recebida 9876543210",
    },
  }).item;

  const tenantAItems = listBankMessageInboxItems(tenantA, [itemA, itemB]);
  assertEqual(tenantAItems.length, 1, "tenant list length");
  assertEqual(tenantAItems[0]?.id, itemA.id, "tenant list item");

  assertTenantError(() => getBankMessageInboxItem(tenantA, itemB));
}

function testMasking(): void {
  const maskedText = maskBankMessageText(
    "Conta 12345678 recebeu pix de pessoa@example.com com documento 12345678901",
  );

  assertEqual(maskedText.includes("12345678"), false, "masked account number");
  assertEqual(maskedText.includes("pessoa@example.com"), false, "masked email");
  assertEqual(maskedText.includes("*******8901"), true, "masked document suffix");
}

function buildSuggestion(id: string): AiSuggestion {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    kind: "transaction_extraction",
    status: "pending_review",
    sourceEntityId: "message-transition",
    confidence: 0.75,
    explanation: "Mensagem bancaria ficticia extraida para revisao.",
    createdAt: now,
    updatedAt: now,
  };
}

function assertBankMessageError(
  action: () => void,
  expectedCode: BankMessageInboxError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof BankMessageInboxError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected bank message inbox error ${expectedCode}.`);
}

function assertTenantError(action: () => void): void {
  try {
    action();
  } catch (error) {
    if (error instanceof TenantAuthorizationError && error.code === "TENANT_RESOURCE_NOT_FOUND") {
      return;
    }

    throw error;
  }

  throw new Error("Expected tenant authorization error.");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
