import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { buildUpdateAccountPayload } from "./account-payloads.js";
import { closePool, query } from "./db.js";
import { createAccountForContext, updateAccountForContext } from "./repositories/accounts.js";

const context: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

void main().finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);

  const account = await createAccountForContext(context, {
    name: `Conta identificadores ${Date.now()}`,
    kind: "checking",
    agencyIdentifier: " 0001 ",
    accountIdentifier: " 12345-6 ",
  });

  assert.deepEqual(await readStoredIdentifiers(account.id), {
    agencyIdentifier: "0001",
    accountIdentifier: "12345-6",
  });

  const agencyOnlyPayload = buildUpdateAccountPayload({ agencyIdentifier: " 0002 " });
  assert.equal("accountIdentifier" in agencyOnlyPayload, false);

  const afterAgencyUpdate = await updateAccountForContext(context, account.id, agencyOnlyPayload);
  assert.equal(afterAgencyUpdate.agencyIdentifier, "0002");
  assert.equal(afterAgencyUpdate.accountIdentifier, "12345-6");
  assert.deepEqual(await readStoredIdentifiers(account.id), {
    agencyIdentifier: "0002",
    accountIdentifier: "12345-6",
  });

  const accountOnlyPayload = buildUpdateAccountPayload({ accountIdentifier: " 99887-1 " });
  assert.equal("agencyIdentifier" in accountOnlyPayload, false);

  const afterAccountUpdate = await updateAccountForContext(context, account.id, accountOnlyPayload);
  assert.equal(afterAccountUpdate.agencyIdentifier, "0002");
  assert.equal(afterAccountUpdate.accountIdentifier, "99887-1");
  assert.deepEqual(await readStoredIdentifiers(account.id), {
    agencyIdentifier: "0002",
    accountIdentifier: "99887-1",
  });

  const clearAgencyPayload = buildUpdateAccountPayload({ agencyIdentifier: "   " });
  assert.equal("accountIdentifier" in clearAgencyPayload, false);

  const afterAgencyClear = await updateAccountForContext(context, account.id, clearAgencyPayload);
  assert.equal(afterAgencyClear.agencyIdentifier, undefined);
  assert.equal(afterAgencyClear.accountIdentifier, "99887-1");
  assert.deepEqual(await readStoredIdentifiers(account.id), {
    agencyIdentifier: null,
    accountIdentifier: "99887-1",
  });
}

async function readStoredIdentifiers(accountId: string): Promise<{
  agencyIdentifier: string | null;
  accountIdentifier: string | null;
}> {
  const rows = await query<{
    agencyIdentifier: string | null;
    accountIdentifier: string | null;
  }>(
    `select "agencyIdentifier", "accountIdentifier"
     from "Account"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );

  assert.equal(rows.length, 1);
  return rows[0]!;
}
