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
    transactions: {
      ok: true,
      data: {
        transactions: [
          {
            id: "planned-1",
            description: "Conta prevista",
            kind: "expense",
            status: "planned",
            amountMinor: 999_999,
            occurredOn: "2026-08-25",
            plannedOn: "2026-08-24",
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
  it("maps canonical financial values without recomputing them and keeps currency mandatory", () => {
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
    assert.deepEqual(model.content.recentItems[0]?.amount, {
      amountMinor: 2_100,
      currency: "USD",
    });
  });

  it("preserves filters and records availability for every dashboard data source", () => {
    const input = successfulInput();
    input.pendingReview = { ok: false, error: "Inbox indisponível" };

    const model = presentDashboard(input);

    assert.equal(model.status, "success");
    assert.deepEqual(model.context.filters, { profileId: "profile-1" });
    assert.deepEqual(model.context.provenance, [
      { source: "api", resource: "/api/financial-summary", availability: "available" },
      { source: "api", resource: "/api/transactions?status=all", availability: "available" },
      {
        source: "api",
        resource: "/api/bank-message-inbox?status=pending_review",
        availability: "unavailable",
      },
      { source: "api", resource: "/api/invoices?status=open", availability: "available" },
    ]);
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
