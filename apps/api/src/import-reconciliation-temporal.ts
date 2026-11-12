import type { EntityId, TenantContext, Transaction } from "@solverfin/domain";

import type { QueryExecutor } from "./db.js";

export async function reconcileImportedTransactionForContext(
  context: TenantContext,
  current: Transaction,
  sourceEffectiveOn: string,
  now: string,
  executeQuery: QueryExecutor,
): Promise<Transaction> {
  if (current.status === "reconciled") return current;

  await executeQuery(
    `update "Transaction" set "status" = 'RECONCILED', "effectiveOn" = $4,
       "reconciledAt" = $5, "updatedAt" = $5, "updatedByUserId" = $6
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [
      current.id,
      context.organizationId,
      context.financialProfileId,
      sourceEffectiveOn,
      now,
      context.userId,
    ],
  );

  return {
    ...current,
    status: "reconciled",
    effectiveOn: sourceEffectiveOn,
    reconciledAt: now,
    updatedAt: now,
    updatedByUserId: context.userId as EntityId,
  };
}
