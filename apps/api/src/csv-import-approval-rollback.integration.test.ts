import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for CSV import rollback integration tests.",
  );

  const token = await loginAndReadToken();
  const suffix = Date.now()
    .toString(36)
    .replace(/[^a-z0-9]/g, "");
  const accountId = await createAccount(token, suffix);

  await assertApprovalRollback(token, accountId, suffix, "transaction_insert");
  await assertApprovalRollback(token, accountId, suffix, "transaction_audit");
  await assertApprovalRollback(token, accountId, suffix, "suggestion_update");
}

async function assertApprovalRollback(
  token: string,
  accountId: string,
  suffix: string,
  failurePoint: FailurePoint,
): Promise<void> {
  const content = [
    "date,description,amount,kind",
    `2026-06-20,Rollback ${failurePoint} ${suffix},-10.00,expense`,
  ].join("\n");
  const created = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `rollback-${failurePoint}-${suffix}.csv`,
    content,
    accountId,
    consentAccepted: true,
  });
  assert.equal(created.statusCode, 201);
  const detail = readBody<ImportDetail>(created);
  const suggestion = detail.suggestions[0];
  assert.ok(suggestion);

  const trigger = await installFailureTrigger(
    failurePoint,
    suggestion.id,
    `${suffix}_${failurePoint}`,
  );
  try {
    const response = await apiRequest(
      token,
      "POST",
      `/api/import-batches/${detail.importBatch.id}/suggestions/${suggestion.id}/approve`,
    );
    assert.equal(response.statusCode, 500);
  } finally {
    await removeFailureTrigger(trigger);
  }

  const transactions = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "Transaction"
      where "aiSuggestionId" = $1`,
    [suggestion.id],
  );
  assert.equal(transactions[0]?.count, 0, `${failurePoint} must not leave a transaction committed`);

  const suggestions = await query<{
    status: string;
    targetEntityId: string | null;
    reviewedAt: Date | null;
  }>(
    `select "status", "targetEntityId", "reviewedAt"
       from "AiSuggestion"
      where "id" = $1`,
    [suggestion.id],
  );
  assert.deepEqual(suggestions[0], {
    status: "PENDING_REVIEW",
    targetEntityId: null,
    reviewedAt: null,
  });

  const approvalAudits = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "AuditLogEntry"
      where "entityKind" = 'AI_SUGGESTION'
        and "entityId" = $1
        and "action" = 'APPROVE'`,
    [suggestion.id],
  );
  assert.equal(
    approvalAudits[0]?.count,
    0,
    `${failurePoint} must not leave an approval audit committed`,
  );

  const reread = await apiRequest(token, "GET", `/api/import-batches/${detail.importBatch.id}`);
  assert.equal(reread.statusCode, 200);
  assert.equal(readBody<ImportDetail>(reread).suggestions[0]?.status, "pending_review");
}

async function installFailureTrigger(
  failurePoint: FailurePoint,
  suggestionId: string,
  suffix: string,
): Promise<InstalledTrigger> {
  const functionName = `test_import_rollback_fn_${suffix}`;
  const triggerName = `test_import_rollback_trg_${suffix}`;

  if (failurePoint === "transaction_insert") {
    await query(`
      create function "${functionName}"() returns trigger language plpgsql as $$
      begin
        if new."aiSuggestionId" = '${suggestionId}'::uuid then
          raise exception 'forced transaction insert failure';
        end if;
        return new;
      end;
      $$;
      create trigger "${triggerName}"
      before insert on "Transaction"
      for each row execute function "${functionName}"();
    `);
    return { table: "Transaction", triggerName, functionName };
  }

  if (failurePoint === "transaction_audit") {
    await query(`
      create function "${functionName}"() returns trigger language plpgsql as $$
      begin
        if new."action" = 'CREATE' and new."entityKind" = 'TRANSACTION' then
          raise exception 'forced transaction audit failure';
        end if;
        return new;
      end;
      $$;
      create trigger "${triggerName}"
      before insert on "AuditLogEntry"
      for each row execute function "${functionName}"();
    `);
    return { table: "AuditLogEntry", triggerName, functionName };
  }

  await query(`
    create function "${functionName}"() returns trigger language plpgsql as $$
    begin
      if old."id" = '${suggestionId}'::uuid and new."status" = 'APPROVED' then
        raise exception 'forced suggestion update failure';
      end if;
      return new;
    end;
    $$;
    create trigger "${triggerName}"
    before update on "AiSuggestion"
    for each row execute function "${functionName}"();
  `);
  return { table: "AiSuggestion", triggerName, functionName };
}

async function removeFailureTrigger(trigger: InstalledTrigger): Promise<void> {
  await query(
    `drop trigger if exists "${trigger.triggerName}" on "${trigger.table}";
     drop function if exists "${trigger.functionName}"();`,
  );
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta rollback ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

async function apiRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body,
  };
  const response =
    (await handleImportBatchesApiRequest(request)) ?? (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled`);
  return response;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

type FailurePoint = "transaction_insert" | "transaction_audit" | "suggestion_update";

interface InstalledTrigger {
  table: "Transaction" | "AuditLogEntry" | "AiSuggestion";
  triggerName: string;
  functionName: string;
}

interface ImportDetail {
  importBatch: { id: string };
  suggestions: Array<{ id: string; status: string }>;
}
