import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@solverfin/domain";

import {
  ChannelProviderError,
  type ChannelInboundMessage,
  type ChannelOutboundPort,
} from "./whatsapp-channel-provider.js";
import {
  type ActiveChannelLink,
  type ChannelEventRow,
  WhatsappChannelError,
} from "./whatsapp-channel-repository.js";
import {
  channelEventIdempotencyKey,
  processInboundChannelMessage,
  type ChannelServiceDependencies,
} from "./whatsapp-channel-service.js";

const context: TenantContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333333",
  financialProfileKind: "personal",
};
const now = new Date("2026-11-13T16:00:00.000Z");
const linkId = "44444444-4444-4444-8444-444444444444";

function message(text: string, id = "wamid.event-001"): ChannelInboundMessage {
  return {
    provider: "meta_whatsapp",
    accountId: "12345678901234",
    externalMessageId: id,
    senderId: "5511999988888",
    text,
    receivedAt: now,
  };
}

function makeActiveLink(): ActiveChannelLink {
  return {
    id: linkId,
    provider: "meta_whatsapp",
    accountId: "12345678901234",
    senderId: "5511999988888",
    challengeHash: null,
    state: "active",
    userId: context.userId,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    financialProfileKind: context.financialProfileKind,
    confirmedAt: now,
    revokedAt: null,
    expiresAt: new Date(now.getTime() + 3600000),
    version: 1,
  };
}

function makeEvent(input: ChannelInboundMessage): ChannelEventRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    provider: input.provider,
    accountId: input.accountId,
    providerMessageId: input.externalMessageId,
    senderId: input.senderId,
    linkId: null,
    userId: null,
    organizationId: null,
    financialProfileId: null,
    assistantConversationId: null,
    suggestionId: null,
    importBatchId: null,
    state: "received",
    outcome: null,
    version: 0,
    attempts: 0,
    leaseToken: null,
    leaseUntil: null,
    replyText: null,
    outboundProviderMessageId: null,
    expiresAt: new Date(now.getTime() + 86400000),
    receivedAt: now,
  };
}

interface Fixture {
  events: Map<string, ChannelEventRow>;
  outbound: ChannelOutboundPort;
  sent: string[];
  queries: { context: TenantContext; question: string; idempotencyKey: string }[];
  captures: string[];
  deps: ChannelServiceDependencies;
  link: ActiveChannelLink | null;
}

function fixture(): Fixture {
  const events = new Map<string, ChannelEventRow>();
  const sent: string[] = [];
  const queries: Fixture["queries"] = [];
  const captures: string[] = [];
  const outward: ChannelOutboundPort = {
    async sendText(request) {
      sent.push(request.text);
      return "wamid.outbound-001";
    },
  };
  const state: Fixture = {
    events,
    sent,
    queries,
    captures,
    outbound: outward,
    link: makeActiveLink(),
    deps: {} as ChannelServiceDependencies,
  };
  state.deps = {
    async claimInbound(inbound) {
      const existing = events.get(inbound.externalMessageId) ?? makeEvent(inbound);
      events.set(inbound.externalMessageId, existing);
      if (existing.state !== "received" && existing.state !== "failure_retryable") {
        return { event: { ...existing }, token: null };
      }
      existing.state = "processing";
      existing.attempts++;
      existing.leaseToken = "fake-lease";
      return { event: { ...existing }, token: "fake-lease" };
    },
    async finishInbound(input) {
      const stored = [...events.values()].find(
        (item) => item.id === input.eventId && item.state === "processing",
      );
      assert.ok(stored);
      assert.equal(input.token, "fake-lease");
      stored.state = "response_ready";
      stored.outcome = input.outcome;
      stored.replyText = input.reply;
      stored.linkId = input.link?.id ?? null;
      stored.userId = input.link?.userId ?? null;
      stored.organizationId = input.link?.organizationId ?? null;
      stored.financialProfileId = input.link?.financialProfileId ?? null;
      stored.assistantConversationId = input.conversationId ?? null;
      stored.suggestionId = input.suggestionId ?? null;
      stored.importBatchId = input.importBatchId ?? null;
    },
    async failInbound(id) {
      const stored = [...events.values()].find((item) => item.id === id);
      if (stored?.state === "processing") stored.state = "failure_retryable";
    },
    async acknowledgePairing() {
      return true;
    },
    async resolveLink(accountId, senderId) {
      return state.link?.state === "active" &&
        state.link.accountId === accountId &&
        state.link.senderId === senderId
        ? state.link
        : null;
    },
    async isLinkActive(link) {
      return (
        state.link?.state === "active" &&
        state.link.id === link.id &&
        state.link.version === link.version
      );
    },
    async replaceRevoked(id) {
      const stored = [...events.values()].find((item) => item.id === id);
      assert.ok(stored);
      if (stored.state === "response_ready") {
        stored.outcome = "awaiting_link";
        stored.replyText = "Vincule novamente no SolverFin.";
      }
    },
    async claimOutbound(id) {
      const stored = [...events.values()].find((item) => item.id === id);
      if (!stored || stored.state !== "response_ready") return null;
      stored.state = "sending";
      stored.leaseToken = "fake-send-lease";
      return { event: { ...stored }, token: "fake-send-lease" };
    },
    async settleOutbound(id, token, status, outboundId) {
      const stored = [...events.values()].find((item) => item.id === id);
      assert.ok(stored);
      assert.equal(token, "fake-send-lease");
      stored.state = status;
      stored.outboundProviderMessageId = outboundId;
      if (status !== "response_ready") stored.replyText = null;
    },
    async authorizeSend(activeLink, send) {
      if (state.link?.state !== "active" || state.link.id !== activeLink.id) {
        throw new WhatsappChannelError("WHATSAPP_LINK_REVOKED", 403);
      }
      return send();
    },
    async queryFinancial(requestContext, question, idempotencyKey) {
      queries.push({ context: requestContext, question, idempotencyKey });
      return {
        conversationId: "66666666-6666-4666-8666-666666666666",
        answer: "Saldo determinístico em BRL: 15,00.",
      };
    },
    async captureFinancial(_requestContext, rawMessage) {
      captures.push(rawMessage);
      return {
        pendingReview: true,
        suggestionId: "77777777-7777-4777-8777-777777777777",
        importBatchId: "88888888-8888-4888-8888-888888888888",
      };
    },
  };
  return state;
}

test("consulta delega ao assistente tenant-scoped e retry não envia resposta duplicada", async () => {
  const state = fixture();
  const inbound = message("quanto gastei em alimentação este mês em BRL?");
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  assert.equal(state.queries.length, 1);
  assert.equal(state.queries[0]?.context.financialProfileId, context.financialProfileId);
  assert.equal(state.queries[0]?.question, inbound.text);
  assert.equal(state.queries[0]?.idempotencyKey, channelEventIdempotencyKey(inbound));
  assert.equal(state.sent.length, 1);
  const event = state.events.get(inbound.externalMessageId);
  assert.equal(event?.state, "sent");
  assert.equal(event?.linkId, linkId);
  assert.equal(event?.assistantConversationId, "66666666-6666-4666-8666-666666666666");
  assert.equal(event?.replyText, null);
});

test("falha terminal do assistente encerra o evento com uma resposta segura", async () => {
  const state = fixture();
  const inbound = message("saldo?", "wamid.failed-turn");
  state.deps.queryFinancial = async (requestContext, question, idempotencyKey) => {
    state.queries.push({ context: requestContext, question, idempotencyKey });
    return {
      conversationId: "66666666-6666-4666-8666-666666666666",
      answer: "Não consegui concluir esta consulta. Envie uma nova pergunta para tentar novamente.",
      completed: false,
    };
  };
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  assert.equal(state.queries.length, 1);
  assert.equal(state.queries[0]?.idempotencyKey, channelEventIdempotencyKey(inbound));
  assert.equal(state.events.get(inbound.externalMessageId)?.outcome, "query_incomplete");
  assert.equal(state.events.get(inbound.externalMessageId)?.state, "sent");
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0] ?? "", /Envie uma nova pergunta/);
});

test("pergunta maior que o contrato canônico recebe resposta terminal sem retry", async () => {
  const state = fixture();
  const inbound = message("CONSULTAR " + "X".repeat(1001), "wamid.question-too-long");
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  assert.equal(state.queries.length, 0);
  assert.equal(state.events.get(inbound.externalMessageId)?.outcome, "unsupported");
  assert.equal(state.events.get(inbound.externalMessageId)?.state, "sent");
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0] ?? "", /longa demais/);
});

test("captura apenas gera sugestão pendente na Inbox, nunca um lançamento financeiro", async () => {
  const state = fixture();
  const inbound = message("CAPTURAR Pix realizado de R$ 20,00 em 13/11/2026");
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  assert.deepEqual(state.captures, ["Pix realizado de R$ 20,00 em 13/11/2026"]);
  assert.equal(state.queries.length, 0);
  assert.equal(
    state.events.get(inbound.externalMessageId)?.suggestionId,
    "77777777-7777-4777-8777-777777777777",
  );
  assert.equal(state.events.get(inbound.externalMessageId)?.outcome, "capture_pending_review");
  assert.match(state.sent[0] ?? "", /Nenhum lançamento foi criado/);
});

test("sem consentimento, captura não simula sugestão ou aprovação", async () => {
  const state = fixture();
  state.deps.captureFinancial = async () => "consent_required";
  await processInboundChannelMessage(
    message("CAPTURAR Pix recebido", "wamid.consent"),
    state.outbound,
    state.deps,
  );
  assert.match(state.sent[0] ?? "", /Autorize/);
  assert.equal(state.events.get("wamid.consent")?.suggestionId, null);
});

test("captura ainda em processamento mantém replay do mesmo evento sem confirmação falsa", async () => {
  const state = fixture();
  const inbound = message("CAPTURAR Compra de R$ 20,00", "wamid.capture-pending");
  let attempts = 0;
  state.deps.captureFinancial = async () => {
    attempts++;
    if (attempts === 1) throw new WhatsappChannelError("WHATSAPP_CAPTURE_PROCESSING", 503);
    return {
      pendingReview: true,
      suggestionId: "77777777-7777-4777-8777-777777777777",
      importBatchId: "88888888-8888-4888-8888-888888888888",
    };
  };
  await assert.rejects(
    () => processInboundChannelMessage(inbound, state.outbound, state.deps),
    (error: unknown) =>
      error instanceof WhatsappChannelError && error.code === "WHATSAPP_EVENT_RETRY_REQUIRED",
  );
  assert.equal(state.events.get(inbound.externalMessageId)?.state, "failure_retryable");
  assert.deepEqual(state.sent, [], "in-flight capture must not acknowledge a missing suggestion");

  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  assert.equal(attempts, 2);
  assert.equal(state.events.get(inbound.externalMessageId)?.state, "sent");
  assert.equal(state.events.get(inbound.externalMessageId)?.outcome, "capture_pending_review");
  assert.equal(state.sent.length, 1);
});

test("origem não vinculada e identidade de outro número não obtêm contexto privado", async () => {
  const state = fixture();
  state.link = null;
  await processInboundChannelMessage(
    message("qual meu saldo?", "wamid.unlinked"),
    state.outbound,
    state.deps,
  );
  assert.equal(state.queries.length, 0);
  assert.match(state.sent[0] ?? "", /vínculo/);
  state.link = makeActiveLink();
  const wrongAccount = { ...message("qual meu saldo?", "wamid.other"), accountId: "99999999999" };
  await processInboundChannelMessage(wrongAccount, state.outbound, state.deps);
  assert.equal(state.queries.length, 0);
  assert.equal(state.events.get(wrongAccount.externalMessageId)?.organizationId, null);
});

test("intenção de pagamento permanece no assistente somente leitura, sem capturar ou escrever", async () => {
  const state = fixture();
  state.deps.queryFinancial = async (ctx, question, id) => {
    state.queries.push({ context: ctx, question, idempotencyKey: id });
    return {
      conversationId: "66666666-6666-4666-8666-666666666666",
      answer: "O Assistente é somente leitura e não executa pagamento ou transferência.",
    };
  };
  await processInboundChannelMessage(
    message("Pague minha conta hoje", "wamid.mutation"),
    state.outbound,
    state.deps,
  );
  assert.equal(state.queries.length, 1);
  assert.equal(state.captures.length, 0);
  assert.match(state.sent[0] ?? "", /não executa pagamento/);
});

test("revogação durante processamento substitui resposta financeira por orientação segura", async () => {
  const state = fixture();
  state.deps.queryFinancial = async () => {
    state.link!.state = "revoked";
    return {
      conversationId: "66666666-6666-4666-8666-666666666666",
      answer: "Saldo privado que não pode sair do servidor.",
    };
  };
  await processInboundChannelMessage(
    message("saldo?", "wamid.revoked"),
    state.outbound,
    state.deps,
  );
  assert.equal(state.events.get("wamid.revoked")?.linkId, null);
  assert.doesNotMatch(state.sent.join(" "), /Saldo privado/);
});

test("revogação depois de persistir e antes do outbound bloqueia resposta antiga", async () => {
  const state = fixture();
  const inbound = message("saldo?", "wamid.ready");
  const ready = makeEvent(inbound);
  ready.state = "response_ready";
  ready.outcome = "query_complete";
  ready.replyText = "DADO PRIVADO";
  ready.linkId = state.link!.id;
  ready.userId = state.link!.userId;
  ready.organizationId = state.link!.organizationId;
  ready.financialProfileId = state.link!.financialProfileId;
  state.events.set(inbound.externalMessageId, ready);
  state.link!.state = "revoked";
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  assert.deepEqual(state.sent, ["Vincule novamente no SolverFin."]);
  assert.equal(state.queries.length, 0);
});

test("crash após persistência antes do envio: retry despacha a saída persistida sem recalcular", async () => {
  const state = fixture();
  const inbound = message("saldo?", "wamid.restart");
  const ready = makeEvent(inbound);
  ready.state = "response_ready";
  ready.outcome = "query_complete";
  ready.replyText = "Resposta previamente calculada.";
  ready.linkId = state.link!.id;
  ready.userId = state.link!.userId;
  ready.organizationId = state.link!.organizationId;
  ready.financialProfileId = state.link!.financialProfileId;
  state.events.set(inbound.externalMessageId, ready);
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  await processInboundChannelMessage(inbound, state.outbound, state.deps);
  assert.equal(state.queries.length, 0);
  assert.deepEqual(state.sent, ["Resposta previamente calculada."]);
});

test("duas mensagens concorrentes com o mesmo ID reivindicam no máximo uma execução", async () => {
  const state = fixture();
  let entered!: () => void;
  let release!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.deps.queryFinancial = async () => {
    entered();
    await gate;
    return { conversationId: "66666666-6666-4666-8666-666666666666", answer: "Uma resposta." };
  };
  const inbound = message("saldo?", "wamid.concurrent");
  const first = processInboundChannelMessage(inbound, state.outbound, state.deps);
  await firstEntered;
  await assert.rejects(
    () => processInboundChannelMessage(inbound, state.outbound, state.deps),
    (error: unknown) => error instanceof WhatsappChannelError && error.statusCode === 503,
  );
  release();
  await first;
  assert.deepEqual(state.sent, ["Uma resposta."]);
});

test("429 permite retry de envio sem recalcular; timeout ambíguo nunca reenvia", async () => {
  const throttled = fixture();
  let attempts = 0;
  throttled.outbound = {
    async sendText(request) {
      attempts++;
      if (attempts === 1) throw new ChannelProviderError("REJECTED", true);
      throttled.sent.push(request.text);
      return "wamid.sent";
    },
  };
  const inbound = message("saldo?", "wamid.throttled");
  await assert.rejects(() =>
    processInboundChannelMessage(inbound, throttled.outbound, throttled.deps),
  );
  assert.equal(throttled.events.get(inbound.externalMessageId)?.state, "response_ready");
  await processInboundChannelMessage(inbound, throttled.outbound, throttled.deps);
  assert.equal(throttled.queries.length, 1);
  assert.equal(throttled.sent.length, 1);

  const unknown = fixture();
  let unknownAttempts = 0;
  unknown.outbound = {
    async sendText() {
      unknownAttempts++;
      throw new Error("connection dropped after POST");
    },
  };
  const uncertain = message("saldo?", "wamid.uncertain");
  await processInboundChannelMessage(uncertain, unknown.outbound, unknown.deps);
  await processInboundChannelMessage(uncertain, unknown.outbound, unknown.deps);
  assert.equal(unknownAttempts, 1);
  assert.equal(unknown.events.get(uncertain.externalMessageId)?.state, "send_unknown");
});

test("cancelamento e expiração não produzem mutações nem chamadas externas adicionais", async () => {
  const state = fixture();
  await processInboundChannelMessage(
    message("CANCELAR", "wamid.cancel"),
    state.outbound,
    state.deps,
  );
  assert.equal(state.events.get("wamid.cancel")?.outcome, "cancelled");
  assert.match(state.sent[0] ?? "", /conversa no SolverFin não foi alterada/);
  assert.equal(state.queries.length, 0);
  assert.equal(state.captures.length, 0);
  const expired = makeEvent(message("saldo?", "wamid.expired"));
  expired.state = "expired";
  state.events.set("wamid.expired", expired);
  await processInboundChannelMessage(
    message("saldo?", "wamid.expired"),
    state.outbound,
    state.deps,
  );
  assert.equal(state.sent.length, 1);
});

test("pairing pede confirmação no app sem revelar a validade do código", async () => {
  const state = fixture();
  state.link = null;
  let codes = 0;
  state.deps.acknowledgePairing = async () => {
    codes++;
    return false;
  };
  await processInboundChannelMessage(
    message("VINCULAR aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "wamid.pair"),
    state.outbound,
    state.deps,
  );
  assert.equal(codes, 1);
  assert.match(state.sent[0] ?? "", /confirme no SolverFin/);
  assert.equal(state.events.get("wamid.pair")?.userId, null);
  assert.equal(state.queries.length, 0);
});
