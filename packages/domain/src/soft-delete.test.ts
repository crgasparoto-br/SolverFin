import { strict as assert } from "node:assert";

import type { Account } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { assertHardDeleteAllowed, listAuditVisibleEntities, listVisibleEntities, softDeleteEntity } from "./soft-delete.js";

const context: TenantContext = {
  userId: "user-soft-delete-demo",
  organizationId: "org-soft-delete-demo",
  financialProfileId: "profile-soft-delete-demo",
  financialProfileKind: "business",
};

const account: Account = {
  id: "account-soft-delete",
  organizationId: context.organizationId,
  financialProfileId: context.financialProfileId,
  name: "Conta teste",
  kind: "checking",
  status: "active",
  currency: "BRL",
  openingBalanceMinor: 0,
  createdAt: "2026-06-16T09:00:00.000Z",
  updatedAt: "2026-06-16T09:00:00.000Z",
  createdByUserId: context.userId,
  updatedByUserId: context.userId,
};

softDeleteHidesEntityFromDefaultLists();
blocksHardDeleteByDefault();

function softDeleteHidesEntityFromDefaultLists(): void {
  const result = softDeleteEntity({
    context,
    entity: account,
    entityKind: "account",
    now: "2026-06-16T10:00:00.000Z",
    reason: "Solicitacao do usuario",
  });

  assert.equal(result.entity.deletedAt, "2026-06-16T10:00:00.000Z");
  assert.equal(result.auditEntry.action, "soft_delete");
  assert.equal(listVisibleEntities(context, [result.entity]).length, 0);
  assert.equal(listAuditVisibleEntities(context, [result.entity]).length, 1);
}

function blocksHardDeleteByDefault(): void {
  assert.throws(() => assertHardDeleteAllowed("transaction"), /Hard delete/);
  assert.doesNotThrow(() => assertHardDeleteAllowed("transaction", true));
}
