import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { presentDashboard, type DashboardPresenterInput } from "./dashboard-presenter.js";

function successfulInput(): DashboardPresenterInput {
  return {
    summary: {
      ok: true,
      data: {
        currencyBlocks: [
          {
            currency: "USD",
            availableBalanceMinor: 12_345,
            incomeMinor: 6_700,
            expensesMinor: 2_100,
            plannedCommitmentsMinor: 900,
          },
        ],
        recentItems: [
          {
            description: "Compra",
            kind: "expense",
            amountMinor: 2_100,
            currency: "USD",
            occurredOn: "2026-08-18",
            status: "posted",
          },
        ],
      },
    },
    pendingReview: { ok: true, data: { messages: [{ id: "review-1" }] } },
    openInvoices: { ok: true, data: { invoices: [{ dueOn: "2026-08-28" }] } },
    filters: { profileId: "profile-1" },
  };
}

describe("dashboard presenter", () => {
  it("maps canonical financial values and gives each KPI a discriminating evidence drilldown", () => {
    const model = presentDashboard(successfulInput());

    assert.equal(model.status, "success");
    if (model.status !== "success") return;

    assert.deepEqual(
      model.content.currencySummaries[0]?.metrics.map((metric) => metric.amount),
      [
        { amountMinor: 12_345, currency: "USD" },
        { amountMinor: 6_700, currency: "USD" },
        { amountMinor: 2_100, currency: "USD" },
        { amountMinor: 900, currency: "USD" },
      ],
    );
    assert.deepEqual(
      model.content.currencySummaries[0]?.metrics.map((metric) => metric.href),
      [
        "/lancamentos?currency=USD",
        "/lancamentos?currency=USD&kind=income&evidence=posted",
        "/lancamentos?currency=USD&kind=expense&evidence=posted",
        "/lancamentos?currency=USD&kind=expense&evidence=planned",
      ],
    );
    assert.equal(
      new Set(model.content.currencySummaries[0]?.metrics.map((metric) => metric.href)).size,
      4,
    );
    assert.deepEqual(model.content.recentItems[0]?.amount, {
      amountMinor: 2_100,
      currency: "USD",
    });
    assert.equal(
      model.content.nextActions[0]?.href,
      "/lancamentos?currency=USD&kind=expense&evidence=planned",
    );
    assert.equal(model.content.dataQuality.status, "complete");
  });

  it("preserves filters and records availability without loading the complete transaction collection", () => {
    const input = successfulInput();
    input.pendingReview = { ok: false, error: "Inbox indisponível" };

    const model = presentDashboard(input);

    assert.equal(model.status, "success");
    if (model.status !== "success") return;
    assert.deepEqual(model.context.filters, { profileId: "profile-1" });
    assert.deepEqual(model.context.provenance, [
      { source: "api", resource: "/api/financial-summary", availability: "available" },
      {
        source: "api",
        resource: "/api/bank-message-inbox?status=pending_review",
        availability: "unavailable",
      },
      { source: "api", resource: "/api/invoices?status=open", availability: "available" },
    ]);
    assert.equal(model.content.dataQuality.status, "partial");
    assert.equal(
      model.context.provenance.some((entry) => entry.resource.includes("/api/transactions")),
      false,
    );
  });

  it("reserves explicit decision modules without fabricating financial amounts", () => {
    const model = presentDashboard(successfulInput());

    assert.equal(model.status, "success");
    if (model.status !== "success") return;
    assert.deepEqual(
      model.content.decisionModules.map((module) => module.href),
      ["/planejamento", "/relatorios", "/assistente-financeiro"],
    );
  });

  it("returns a typed empty state when the mandatory summary has no financial evidence", () => {
    const input = successfulInput();
    input.summary = { ok: true, data: { currencyBlocks: [], recentItems: [] } };

    const model = presentDashboard(input);

    assert.equal(model.status, "empty");
    if (model.status !== "empty") return;
    assert.match(model.empty.title, /Ainda não há dados financeiros/);
  });

  it("returns a typed error when the mandatory financial summary is unavailable", () => {
    const input = successfulInput();
    input.summary = { ok: false, error: "Resumo indisponível" };

    const model = presentDashboard(input);

    assert.equal(model.status, "error");
    if (model.status !== "error") return;
    assert.equal(model.error.message, "Resumo indisponível");
    assert.equal(model.context.provenance[0]?.availability, "unavailable");
  });
});
