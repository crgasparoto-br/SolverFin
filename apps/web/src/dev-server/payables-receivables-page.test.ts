import assert from "node:assert/strict";

import { renderPayablesReceivablesPage } from "./payables-receivables-page.js";

const originalFetch = globalThis.fetch;

await payablesReceivablesPageExposesMainMaintenanceFlow();

globalThis.fetch = originalFetch;

async function payablesReceivablesPageExposesMainMaintenanceFlow(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/payables-receivables") {
      return jsonResponse({
        payablesReceivables: [
          {
            id: "payable-1",
            kind: "payable",
            status: "pending",
            amountMinor: 125000,
            currency: "BRL",
            dueOn: "2026-06-25",
            description: "Fornecedor",
            accountId: "account-1",
            categoryId: "category-1",
          },
          {
            id: "receivable-1",
            kind: "receivable",
            status: "settled",
            amountMinor: 250000,
            currency: "BRL",
            dueOn: "2026-06-20",
            description: "Cliente",
            accountId: "account-1",
            settledAt: "2026-06-20T12:00:00.000Z",
          },
          {
            id: "payable-cancelled",
            kind: "payable",
            status: "cancelled",
            amountMinor: 50000,
            currency: "BRL",
            dueOn: "2026-06-18",
            description: "Conta cancelada",
            cancelledAt: "2026-06-18T12:00:00.000Z",
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [{ id: "account-1", name: "Conta principal", kind: "checking", status: "active" }],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({
        categories: [{ id: "category-1", name: "Serviços", kind: "expense", status: "active" }],
      });
    }

    return jsonResponse({});
  };

  const html = await renderPayablesReceivablesPage("session-token");

  assert.match(html, /Contas a pagar e receber/);
  assert.match(html, /Fornecedor/);
  assert.match(html, /Cliente/);
  assert.match(html, /Conta principal/);
  assert.match(html, /Serviços/);
  assert.match(html, /data-api-path="\/api\/payables-receivables"/);
  assert.match(
    html,
    /data-api-method="PATCH" data-api-path="\/api\/payables-receivables\/payable-1"/,
  );
  assert.match(html, /\/api\/payables-receivables\/payable-1\/settle/);
  assert.match(html, /\/api\/payables-receivables\/payable-1\/cancel/);
  assert.match(html, /Concluir pagamento/);
  assert.match(html, /Não há edição para itens já concluídos/);
  assert.doesNotMatch(html, /archive/);
  assert.doesNotMatch(html, /restore/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
