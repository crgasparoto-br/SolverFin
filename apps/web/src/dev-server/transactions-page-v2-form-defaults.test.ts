import assert from "node:assert/strict";
import test from "node:test";

import { renderTransactionsPageV2 } from "./transactions-page-v2.js";

const originalFetch = globalThis.fetch;

test("novo lançamento sugere datas locais e aplica fallbacks temporais seguros", async () => {
  globalThis.fetch = mockFetch();

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-brl&month=2026-09"),
    );

    assert.match(
      html,
      /Data do evento<input name="occurredOn" type="date" required \/>/,
      "a data do evento continua obrigatória no lançamento simples",
    );
    assert.match(
      html,
      /Data prevista<input name="plannedOn" type="date" \/>/,
      "a data prevista pode ficar vazia porque usa a data do evento como fallback",
    );
    assert.match(
      html,
      /const currentLocalDate = \(\) => \{ const now = new Date\(\); return String\(now\.getFullYear\(\)\)/,
      "a sugestão usa a data civil local do navegador, sem converter o dia por UTC",
    );
    assert.match(
      html,
      /const today = currentLocalDate\(\); form\.occurredOn\.value = today; form\.plannedOn\.value = today;/,
      "ao abrir um novo lançamento, evento e previsão começam com a data atual",
    );
    assert.match(
      html,
      /const normalizedPlannedOn = String\(plannedOn \|\| ""\)\.trim\(\) \|\| occurredOn;/,
      "data prevista vazia deve repetir a data do evento",
    );
    assert.match(
      html,
      /const explicitEffectiveOn = String\(effectiveOn \|\| ""\)\.trim\(\); const isCreate = \(form\.dataset\.method \|\| "POST"\) === "POST";/,
      "a normalização diferencia criação de atualização",
    );
    assert.match(
      html,
      /const normalizedEffectiveOn = status === "posted" \|\| status === "reconciled" \? \(explicitEffectiveOn \|\| \(isCreate \? occurredOn : undefined\)\) : null;/,
      "criação efetivada usa a data do evento, mas atualização sem data explícita não fabrica data efetiva",
    );
    assert.match(
      html,
      /if \(normalizedEffectiveOn !== undefined\) result\.effectiveOn = normalizedEffectiveOn;/,
      "transições em edição deixam o domínio aplicar a data canônica quando a data efetiva não foi informada",
    );
    assert.match(
      html,
      /plannedOn: item\.plannedOn, effectiveOn: item\.effectiveOn/,
      "parcelamentos reutilizam as mesmas datas normalizadas",
    );
    assert.match(
      html,
      /form\.dataset\.method = clone \? "POST" : "PATCH";[\s\S]*form\.occurredOn\.value = transaction\.occurredOn; form\.plannedOn\.value = transaction\.plannedOn \|\| transaction\.occurredOn; form\.effectiveOn\.value = transaction\.effectiveOn \|\| "";/,
      "edição e clonagem hidratam as datas persistidas sem substituir pela data atual",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mensagens do formulário de lançamentos permanecem em pt-BR", async () => {
  globalThis.fetch = mockFetch();

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-brl&month=2026-09"),
    );

    assert.match(
      html,
      /TRANSACTION_EFFECTIVE_DATE_REQUIRED: "Lançamentos efetivados ou conciliados exigem data efetiva\."/,
    );
    assert.match(
      html,
      /const safeMessageCodes = new Set\(\["INSTALLMENT_PAYLOAD_INVALID"\]\);/,
      "validações controladas de parcelamento podem preservar detalhes úteis em pt-BR",
    );
    assert.match(
      html,
      /const safeDetail = safeMessageCodes\.has\(code\) \? String\(body\?\.error\?\.message \|\| ""\) : "";/,
      "detalhes retornados pela API só são reutilizados para códigos explicitamente permitidos",
    );
    assert.match(
      html,
      /Não foi possível concluir a ação\. Revise os dados e tente novamente\./,
      "erros desconhecidos recebem fallback em pt-BR",
    );
    assert.doesNotMatch(
      html,
      /body\.error && body\.error\.message/,
      "o formulário não deve expor diretamente mensagens técnicas retornadas pela API",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function mockFetch() {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");
    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-brl",
            name: "Conta corrente",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "BRL",
          },
        ],
      });
    }
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
    if (url.pathname === "/api/transaction-groups") return jsonResponse({ groups: [] });
    if (url.pathname === "/api/transactions") return jsonResponse({ transactions: [] });
    return jsonResponse({});
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
