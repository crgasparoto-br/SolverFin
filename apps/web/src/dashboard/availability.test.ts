import assert from "node:assert/strict";

import {
  buildAvailabilityDashboardViewModel,
  type DailyAvailabilityResult,
} from "./availability.js";

buildsReadyCardWithDetails();
flagsLowConfidenceState();
handlesLoadingEmptyAndErrorStates();

function buildsReadyCardWithDetails(): void {
  const viewModel = buildAvailabilityDashboardViewModel({ result: availabilityFixture("medium") });

  assert.equal(viewModel.card.state, "ready");
  assert.match(viewModel.card.amountText ?? "", /R\$.*945,00/);
  assert.equal(viewModel.card.secondaryActions.includes("edit_assumptions"), true);
  assert.equal(viewModel.detailSections.some((section) => section.title === "Recorrencias inferidas"), true);
  assert.equal(viewModel.reviewItems.some((item) => item.action === "review_inferred_recurrences"), true);
}

function flagsLowConfidenceState(): void {
  const viewModel = buildAvailabilityDashboardViewModel({ result: availabilityFixture("low") });

  assert.equal(viewModel.card.state, "low_confidence");
  assert.match(viewModel.card.subtitle, /Confira as premissas/);
  assert.equal(viewModel.reviewItems.some((item) => item.id === "limitations"), true);
}

function handlesLoadingEmptyAndErrorStates(): void {
  assert.equal(buildAvailabilityDashboardViewModel({ isLoading: true }).card.state, "loading");
  assert.equal(buildAvailabilityDashboardViewModel({}).card.state, "empty");
  assert.equal(
    buildAvailabilityDashboardViewModel({ errorMessage: "Nao foi possivel calcular agora." }).card
      .primaryAction,
    "retry",
  );
}

function availabilityFixture(confidence: DailyAvailabilityResult["confidence"]): DailyAvailabilityResult {
  return {
    availableTodayMinor: 94500,
    projectedBalanceMinor: 94500,
    currency: "BRL",
    horizonStartOn: "2026-06-16",
    horizonEndOn: "2026-06-30",
    confidence,
    components: [
      {
        label: "Saldo atual",
        kind: "balance",
        amountMinor: 50000,
        confidence: "high",
        source: "accounts",
      },
      {
        label: "Fatura",
        kind: "card",
        amountMinor: -25000,
        confidence: "high",
        source: "invoices",
      },
      {
        label: "Mercado",
        kind: "inferred",
        amountMinor: -18000,
        confidence: confidence === "low" ? "low" : "medium",
        source: "statistical_recurrences",
      },
    ],
    assumptions: ["Margem de seguranca configurada."],
    appliedAssumptionIds: ["assumption-1"],
    limitations: confidence === "low" ? ["Historico incompleto."] : [],
    calculatedAt: "2026-06-16T12:00:00.000Z",
  };
}
