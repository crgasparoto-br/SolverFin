import assert from "node:assert/strict";

import type { TenantContext } from "./tenant.js";
import {
  archiveFinancialAssumption,
  createFinancialAssumption,
  deactivateFinancialAssumption,
  listFinancialAssumptions,
  resolveAvailabilityAssumptions,
  restoreFinancialAssumption,
  updateFinancialAssumption,
} from "./financial-assumptions.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";

const now = "2026-06-16T12:00:00.000Z";
const tenantA: TenantContext = {
  userId: "user-a",
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
};
const tenantB: TenantContext = {
  userId: "user-b",
  organizationId: "org-b",
  financialProfileId: "profile-b",
  financialProfileKind: "business",
};

createsAndResolvesDefaults();
updatedAssumptionChangesCalculation();
deactivatedAndArchivedAssumptionsAreExcluded();
tenantIsolationIsEnforced();

function createsAndResolvesDefaults(): void {
  const assumption = createFinancialAssumption({
    id: "assumption-horizon",
    context: tenantA,
    now,
    payload: {
      kind: "horizon_days",
      scope: { kind: "profile" },
      value: 15,
      origin: "user",
      effectiveFrom: "2026-06-01",
    },
  }).assumption;

  const resolved = resolveAvailabilityAssumptions(tenantA, [assumption], "2026-06-16");

  assert.equal(assumption.organizationId, tenantA.organizationId);
  assert.equal(assumption.financialProfileId, tenantA.financialProfileId);
  assert.equal(assumption.status, "active");
  assert.equal(resolved.horizonDays, 15);
  assert.equal(resolved.safetyMarginPercent, 10);
  assert.equal(resolved.includeInferredRecurrences, true);
  assert.equal(resolved.appliedAssumptionIds.includes(assumption.id), true);
}

function updatedAssumptionChangesCalculation(): void {
  const reserve = createFinancialAssumption({
    id: "assumption-reserve",
    context: tenantA,
    now,
    payload: {
      kind: "reserve_amount",
      scope: { kind: "calculation", entityId: "daily-availability" },
      value: 20000,
      effectiveFrom: "2026-06-01",
    },
  }).assumption;
  const updated = updateFinancialAssumption({
    context: tenantA,
    assumption: reserve,
    now: "2026-06-16T13:00:00.000Z",
    payload: {
      value: 35000,
      reason: "Aumentar colchao de caixa",
    },
  }).assumption;
  const resolved = resolveAvailabilityAssumptions(tenantA, [updated], "2026-06-16");

  assert.equal(updated.version, 2);
  assert.equal(updated.reason, "Aumentar colchao de caixa");
  assert.equal(resolved.reserveAmountMinor, 35000);
}

function deactivatedAndArchivedAssumptionsAreExcluded(): void {
  const includeInferred = createFinancialAssumption({
    id: "assumption-inferred-off",
    context: tenantA,
    now,
    payload: {
      kind: "include_inferred_recurrences",
      scope: { kind: "profile" },
      value: false,
      effectiveFrom: "2026-06-01",
    },
  }).assumption;
  const deactivated = deactivateFinancialAssumption(
    tenantA,
    includeInferred,
    "2026-06-16T14:00:00.000Z",
  ).assumption;
  const archived = archiveFinancialAssumption(
    tenantA,
    deactivated,
    "2026-06-16T15:00:00.000Z",
  ).assumption;
  const restored = restoreFinancialAssumption(
    tenantA,
    archived,
    "2026-06-16T16:00:00.000Z",
  ).assumption;

  assert.equal(
    resolveAvailabilityAssumptions(tenantA, [deactivated], "2026-06-16").includeInferredRecurrences,
    true,
  );
  assert.equal(listFinancialAssumptions(tenantA, [archived]).length, 0);
  assert.equal(restored.status, "active");
  assert.equal(
    resolveAvailabilityAssumptions(tenantA, [restored], "2026-06-16").includeInferredRecurrences,
    false,
  );
}

function tenantIsolationIsEnforced(): void {
  const assumption = createFinancialAssumption({
    id: "assumption-tenant",
    context: tenantA,
    now,
    payload: {
      kind: "safety_margin_percent",
      scope: { kind: "profile" },
      value: 20,
      effectiveFrom: "2026-06-01",
    },
  }).assumption;

  assert.equal(listFinancialAssumptions(tenantB, [assumption]).length, 0);
  assert.throws(
    () => updateFinancialAssumption({ context: tenantB, assumption, now, payload: { value: 5 } }),
    TenantAuthorizationError,
  );
}
