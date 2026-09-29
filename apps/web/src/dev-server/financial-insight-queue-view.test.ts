import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { presentDashboard, type DashboardPresenterInput } from "./dashboard-presenter.js";
import {
  buildFinancialInsightHref,
  presentFinancialInsightQueue,
  type FinancialInsightQueueApiItem,
  type FinancialInsightQueueApiPage,
} from "./financial-insight-queue-presenter.js";
import {
  renderDashboardFinancialInsights,
  renderInboxFinancialInsights,
} from "./financial-insight-queue-view.js";

describe("financial insight queue presentation (#621)", () => {
  it("reproduces the canonical #617 slice in the negative balance deep link", () => {
    const risk = item("risk", "negative_balance_risk", "critical", "USD");
    assert.equal(
      buildFinancialInsightHref(risk.proposal),
      "/relatorios?view=cash-flow&referenceDate=2026-09-29&horizonDays=30#cash-flow-usd",
    );
  });

  it("keeps category/merchant filters on transaction and budget deep links", () => {
    const budget = item("budget", "budget_exceeded", "warning", "BRL");
    budget.proposal.navigation = { view: "budgets", categoryId: "cat-1" };
    assert.equal(buildFinancialInsightHref(budget.proposal), "/orcamentos?categoryId=cat-1");
    const increase = item("increase", "merchant_spending_increase", "info", "BRL");
    increase.proposal.navigation = { view: "transactions", merchantKey: "padaria" };
    assert.equal(
      buildFinancialInsightHref(increase.proposal),
      "/lancamentos?month=2026-09&merchantKey=padaria",
    );
  });

  it("renders at most three Dashboard items in API order with a link to the full queue", () => {
    const page = pageOf(
      [
        item("a", "negative_balance_risk", "critical", "USD"),
        item("b", "budget_exceeded", "warning", "BRL"),
        item("c", "category_spending_increase", "warning", "BRL"),
        item("d", "monthly_summary", "info", "BRL"),
      ],
      5,
    );
    const model = presentDashboard({ ...dashboardInput(), financialInsights: page });
    assert.equal(model.status, "success");
    if (model.status !== "success") return;
    const insights = model.content.financialInsights;
    assert.ok(insights && insights.status === "ready");
    assert.deepEqual(
      insights.items.map((entry) => entry.id),
      ["a", "b", "c"],
    );

    const html = renderDashboardFinancialInsights(insights);
    assert.equal(html.match(/class="insight-queue-item"/g)?.length, 3);
    assert.match(html, /Ver todos os insights \(5\)/);
    assert.match(html, /href="\/inbox#financial-insights"/);
    assert.ok(html.indexOf('data-insight-id="a"') < html.indexOf('data-insight-id="b"'));
    assert.match(html, /Crítico/);
    assert.match(html, /aria-label="Moeda USD"/);
    assert.doesNotMatch(html, /data-insight-resolve|sha256-|dataFingerprint|insightKey/);
  });

  it("keeps the Dashboard usable when the insight queue is unavailable", () => {
    const html = renderDashboardFinancialInsights(
      presentFinancialInsightQueue({ ok: false, error: "503" }),
    );
    assert.match(html, /Insights temporariamente indisponíveis/);
  });

  it("offers resolve, snooze (1/7/30) and progressive loading in the Inbox", () => {
    const page = pageOf([item("a", "budget_exceeded", "warning", "BRL")], 12, 1);
    const html = renderInboxFinancialInsights(presentFinancialInsightQueue(page), {
      moreHref: "/inbox?insights=20#financial-insights",
    });
    assert.match(html, /id="financial-insights"/);
    assert.match(html, /data-insight-resolve="a" data-insight-fingerprint="sha256-a"/);
    assert.match(html, /data-insight-snooze="a"/);
    for (const days of ["1", "7", "30"]) {
      assert.match(html, new RegExp(`name="durationDays" value="${days}"`));
    }
    assert.match(html, /Mostrar mais insights/);
    assert.match(html, /12 ativos/);
    assert.match(html, /Despesas realizadas/);
    assert.doesNotMatch(html, /valor_atual|dataFingerprint|insightKey/);
  });
});

function item(
  id: string,
  insightKind: FinancialInsightQueueApiItem["proposal"]["insightKind"],
  severity: FinancialInsightQueueApiItem["severity"],
  currency: string,
): FinancialInsightQueueApiItem {
  return {
    id,
    state: "active",
    severity,
    fingerprint: `sha256-${id}`,
    proposal: {
      insightKind,
      title: `Insight ${id}`,
      summary: "Resumo determinístico.",
      periodStartOn: "2026-09-01",
      periodEndOn: "2026-09-29",
      currency,
      filters: { currency },
      evidence: [{ label: "valor_atual", value: 12_345, unit: "minor_currency", currency }],
      navigation:
        insightKind === "negative_balance_risk"
          ? { view: "cash_flow", referenceDate: "2026-09-29", horizonDays: 30 }
          : { view: "transactions" },
    },
  };
}

function pageOf(
  items: FinancialInsightQueueApiItem[],
  total: number,
  nextOffset: number | undefined = items.length < total ? items.length : undefined,
): { ok: true; data: FinancialInsightQueueApiPage } {
  return {
    ok: true,
    data: {
      state: "active",
      total,
      offset: 0,
      limit: items.length,
      ...(nextOffset === undefined ? {} : { nextOffset }),
      items,
    },
  };
}

function dashboardInput(): DashboardPresenterInput {
  return {
    summary: {
      ok: true,
      data: {
        currencyBlocks: [
          {
            currency: "BRL",
            availableBalanceMinor: 1000,
            incomeMinor: 0,
            expensesMinor: 0,
            netVariationMinor: 0,
            plannedCommitmentsMinor: 0,
            accounts: [],
          },
        ],
        recentItems: [],
      },
    },
    pendingReview: { ok: true, data: { messages: [] } },
    openInvoices: { ok: true, data: { invoices: [] } },
    cashFlowProjection: { ok: false, error: "indisponível" },
    filters: {},
  };
}
