import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDashboardOverview, type DashboardOverview } from "./dashboard-overview-view.js";

const example: DashboardOverview = {
  referenceDate: "2026-11-19",
  purchaseOn: "2026-11-19",
  periodStartOn: "2026-11-01",
  periodEndOn: "2026-11-30",
  accountBalances: [
    {
      id: "conta-1",
      name: "Conta corrente",
      kind: "checking",
      currency: "BRL",
      balanceMinor: 10000,
    },
    { id: "conta-2", name: "Reserva", kind: "investment", currency: "USD", balanceMinor: 2500 },
  ],
  cardSpending: [{ id: "cartao-1", name: "Principal", currency: "BRL", spentMinor: 5000 }],
  cardAdvice: [
    {
      id: "cartao-1",
      name: "Principal",
      currency: "BRL",
      closingOn: "2026-12-13",
      dueOn: "2026-12-18",
      daysUntilPayment: 29,
      recommended: true,
    },
  ],
  payables: [
    {
      id: "pagamento-1",
      source: "transaction",
      description: "Luz",
      currency: "BRL",
      dueOn: "2026-11-20",
      amountMinor: 2500,
      overdue: false,
    },
    {
      id: "invoice-1",
      source: "invoice",
      description: "Fatura cartão",
      currency: "BRL",
      dueOn: "2026-11-10",
      amountMinor: 8000,
      overdue: true,
    },
  ],
  payableTotals: [{ currency: "BRL", amountMinor: 10500, overdueMinor: 8000, count: 2 }],
  categoryExpenses: [{ currency: "BRL", category: "Mercado", amountMinor: 5000 }],
  monthlyTrend: [{ currency: "BRL", month: "2026-11", incomeMinor: 12000, expensesMinor: 5000 }],
};

describe("dashboard operational widgets", () => {
  it("renders ranking, payables, account classification and distinct currency amounts", () => {
    const html = renderDashboardOverview(example);
    assert.match(html, /Melhor cartão para comprar hoje/);
    assert.match(html, /29 <small>dias até o vencimento/);
    assert.match(html, /Fecha 13\/12\/2026/);
    assert.match(html, /Simular data da compra/);
    assert.match(html, /Em aberto · BRL \(2\)/);
    assert.match(html, /Vencido/);
    assert.match(html, /Conta corrente/);
    assert.match(html, /Investimento/);
    assert.match(html, /Gastos por cartão/);
    assert.match(html, /Mercado/);
    assert.match(html, /Evolução financeira/);
    assert.match(html, /USD/);
    assert.doesNotMatch(html, /pagar-receber/);
  });

  it("escapes untrusted descriptions and prevents injected HTML", () => {
    const html = renderDashboardOverview({
      ...example,
      accountBalances: [{ ...example.accountBalances[0]!, name: '<img src=x onerror="alert(1)">' }],
      payables: [{ ...example.payables[0]!, description: "<script>alert(1)</script>" }],
    });
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img src=x/);
  });

  it("shows actionable empty and unavailable states without a phantom winner", () => {
    const empty = renderDashboardOverview({
      ...example,
      cardAdvice: [],
      cardSpending: [],
      payables: [],
      payableTotals: [],
      accountBalances: [],
      categoryExpenses: [],
      monthlyTrend: [],
    });
    assert.match(empty, /Nenhum cartão ativo/);
    assert.doesNotMatch(empty, /Cartão recomendado/);
    assert.match(empty, /Não há contas ou faturas pendentes/);
    const partial = renderDashboardOverview(undefined);
    assert.match(partial, /data-overview="unavailable"/);
    assert.match(partial, /temporariamente indisponíveis/);
  });

  it("labels multiple winners and a future simulation without claiming today", () => {
    const html = renderDashboardOverview({
      ...example,
      purchaseOn: "2026-11-20",
      cardAdvice: [
        example.cardAdvice[0]!,
        { ...example.cardAdvice[0]!, id: "cartao-2", name: "Secundário" },
      ],
    });
    assert.match(html, /Cartões empatados no maior prazo/);
    assert.match(html, /Voltar para hoje/);
    assert.match(html, /na data escolhida/);
  });
});
