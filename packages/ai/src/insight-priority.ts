import type { FinancialInsightKind, FinancialInsightSeverity } from "./insights.js";

/**
 * Versioned, deterministic priority policy for the financial insight queue (#621).
 *
 * Order: severity (`critical > warning > info`), then the fixed type precedence below,
 * then a stable identity key. `confidence`, `createdAt`, title and persistence order never
 * participate. Adding a new insight kind requires an explicit position in
 * `FINANCIAL_INSIGHT_TYPE_PRECEDENCE` (enforced by the `Record` type) and a policy version bump.
 */
export const FINANCIAL_INSIGHT_PRIORITY_POLICY_VERSION = "financial-insight-priority-v1" as const;

export type PrioritizedFinancialInsightKind = Exclude<FinancialInsightKind, "insufficient_data">;

export const FINANCIAL_INSIGHT_SEVERITY_RANK: Readonly<Record<FinancialInsightSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export const FINANCIAL_INSIGHT_TYPE_PRECEDENCE: Readonly<
  Record<PrioritizedFinancialInsightKind, number>
> = {
  negative_balance_risk: 0,
  budget_exceeded: 1,
  category_spending_increase: 2,
  merchant_spending_increase: 3,
  probable_subscription: 4,
  monthly_summary: 5,
};

/**
 * Severity used when a persisted snapshot predates #621 and carries no `severity`.
 * It mirrors the minimum severity each detector can emit, so a legacy snapshot is never
 * promoted above what its detector would have produced.
 */
export const FINANCIAL_INSIGHT_FALLBACK_SEVERITY: Readonly<
  Record<PrioritizedFinancialInsightKind, FinancialInsightSeverity>
> = {
  negative_balance_risk: "critical",
  budget_exceeded: "warning",
  category_spending_increase: "info",
  merchant_spending_increase: "info",
  probable_subscription: "info",
  monthly_summary: "info",
};

export interface FinancialInsightPriorityKey {
  insightKind: PrioritizedFinancialInsightKind;
  severity?: FinancialInsightSeverity;
  currency: string;
  periodStartOn: string;
  insightKey: string;
  /** Snapshot identity; last-resort tie-breaker between equivalent keys. */
  dataFingerprint: string;
}

export function resolveFinancialInsightSeverity(
  key: Pick<FinancialInsightPriorityKey, "insightKind" | "severity">,
): FinancialInsightSeverity {
  return key.severity ?? FINANCIAL_INSIGHT_FALLBACK_SEVERITY[key.insightKind];
}

export function compareFinancialInsightPriority(
  left: FinancialInsightPriorityKey,
  right: FinancialInsightPriorityKey,
): number {
  return (
    FINANCIAL_INSIGHT_SEVERITY_RANK[resolveFinancialInsightSeverity(left)] -
      FINANCIAL_INSIGHT_SEVERITY_RANK[resolveFinancialInsightSeverity(right)] ||
    FINANCIAL_INSIGHT_TYPE_PRECEDENCE[left.insightKind] -
      FINANCIAL_INSIGHT_TYPE_PRECEDENCE[right.insightKind] ||
    compareText(left.currency, right.currency) ||
    compareText(left.periodStartOn, right.periodStartOn) ||
    compareText(left.insightKey, right.insightKey) ||
    compareText(left.dataFingerprint, right.dataFingerprint)
  );
}

export function sortFinancialInsightsByPriority<T>(
  items: readonly T[],
  keyOf: (item: T) => FinancialInsightPriorityKey,
): T[] {
  return [...items].sort((left, right) =>
    compareFinancialInsightPriority(keyOf(left), keyOf(right)),
  );
}

/**
 * Removes equivalent snapshots (same kind, identity key, calculation version and data
 * fingerprint). Different kinds are never merged, even when they share category, period,
 * currency or evidence: there is no implicit cross-type suppression.
 */
export function deduplicateEquivalentFinancialInsights<T>(
  items: readonly T[],
  keyOf: (item: T) => FinancialInsightPriorityKey & {
    calculationVersion: string;
    /** Stable persisted identifier used only to pick one row among equivalent copies. */
    snapshotId: string;
  },
): T[] {
  const byIdentity = new Map<string, { item: T; snapshotId: string }>();
  for (const item of items) {
    const key = keyOf(item);
    const identity = [
      key.insightKind,
      key.insightKey,
      key.calculationVersion,
      key.dataFingerprint,
    ].join("\u0000");
    const current = byIdentity.get(identity);
    if (current === undefined || key.snapshotId < current.snapshotId) {
      byIdentity.set(identity, { item, snapshotId: key.snapshotId });
    }
  }
  return [...byIdentity.values()].map((entry) => entry.item);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
