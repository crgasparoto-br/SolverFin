import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { handleAutomationRulesApiRequest } from "./automation-rules-router.js";
import { closePool, getPool } from "./db.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

interface SavedRule {
  rule: {
    id: string;
    status: string;
    purpose: "automation" | "manual_entry";
    financialProfileId: string;
    conditions: { descriptionIncludes?: string };
    actions: { categoryId?: string };
  };
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);
  const token = await loginAndReadToken();
  const profileA = await createProfile(token);
  const profileB = await createProfile(token);
  const categoryA = await createCategory(token, profileA);
  const categoryB = await createCategory(token, profileB);
  const saveA = `/api/automation-rules/manual-entry?profileId=${profileA}`;
  const payload = { description: "Fiat por Assinatura", categoryId: categoryA };
  const responses = await Promise.all([
    request(token, "POST", saveA, payload),
    request(token, "POST", saveA, { ...payload, description: "fíat POR assinatura" }),
  ]);
  assert.deepEqual(
    responses.map((r) => r.statusCode),
    [200, 200],
  );
  const [first, second] = responses.map((r) => body<SavedRule>(r)) as [SavedRule, SavedRule];
  assert.equal(first.rule.id, second.rule.id);
  assert.equal(first.rule.status, "inactive");
  assert.equal(second.rule.status, "inactive");
  assert.equal(first.rule.purpose, "manual_entry");
  assert.equal(second.rule.purpose, "manual_entry");

  const list = await request(
    token,
    "GET",
    `/api/automation-rules?profileId=${profileA}&status=all`,
  );
  assert.equal(list.statusCode, 200);
  const entries = body<{ rules: SavedRule["rule"][] }>(list).rules.filter(
    (rule) => rule.id === first.rule.id,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.actions.categoryId, categoryA);

  const active = await request(
    token,
    "GET",
    `/api/automation-rules?profileId=${profileA}&status=active`,
  );
  assert.equal(active.statusCode, 200);
  assert.equal(
    body<{ rules: SavedRule["rule"][] }>(active).rules.some((rule) => rule.id === first.rule.id),
    false,
  );

  // No manual rule can accidentally be promoted into background automation.
  const activation = await request(
    token,
    "PATCH",
    `/api/automation-rules/${first.rule.id}?profileId=${profileA}`,
    { status: "active" },
  );
  assert.equal(activation.statusCode, 400);
  assert.equal(errorCode(activation), "MANUAL_FILL_RULE_MUST_BE_INACTIVE");

  const rulePath = `/api/automation-rules/${first.rule.id}?profileId=${profileA}`;
  // Renaming and activating the same manual rule cannot bypass its immutable origin.
  const disguised = await request(token, "PATCH", rulePath, {
    name: "Regra automática disfarçada",
    status: "active",
  });
  assert.equal(disguised.statusCode, 400);
  assert.equal(errorCode(disguised), "MANUAL_FILL_RULE_MUST_BE_INACTIVE");

  const renamed = await request(token, "PATCH", rulePath, {
    name: "Descrição manual renomeada",
    purpose: "automation",
  });
  assert.equal(renamed.statusCode, 200);
  assert.equal(body<SavedRule>(renamed).rule.purpose, "manual_entry");
  assert.equal(body<SavedRule>(renamed).rule.status, "inactive");

  // A second request cannot promote a previously renamed manual rule either.
  const activatedAfterRename = await request(token, "PATCH", rulePath, {
    status: "active",
  });
  assert.equal(activatedAfterRename.statusCode, 400);
  assert.equal(errorCode(activatedAfterRename), "MANUAL_FILL_RULE_MUST_BE_INACTIVE");

  const spoofed = await request(token, "PATCH", rulePath, {
    purpose: "automation",
    status: "active",
  });
  assert.equal(spoofed.statusCode, 400);
  assert.equal(errorCode(spoofed), "MANUAL_FILL_RULE_MUST_BE_INACTIVE");

  // Upsert must find the existing rule even after its display name changes.
  const sameRule = await request(token, "POST", saveA, payload);
  assert.equal(sameRule.statusCode, 200);
  assert.equal(body<SavedRule>(sameRule).rule.id, first.rule.id);
  assert.equal(body<SavedRule>(sameRule).rule.purpose, "manual_entry");

  // SQL-level invariants prevent bypass by another writer or a future repository.
  await assert.rejects(
    () =>
      getPool().query(
        `update "AutomationRule" set "purpose" = 'automation' where "id" = $1`,
        [first.rule.id],
      ),
    /purpose is immutable/,
  );
  await assert.rejects(
    () =>
      getPool().query(
        `update "AutomationRule" set "status" = 'ACTIVE' where "id" = $1`,
        [first.rule.id],
      ),
    /AutomationRule_manual_entry_inactive_check/,
  );

  // A normal automation may still be active and its name remains editable.
  const automatic = await request(token, "POST", `/api/automation-rules?profileId=${profileA}`, {
    name: "Automação legítima",
    status: "active",
    descriptionIncludes: "Mercado",
    actionCategoryId: categoryA,
    purpose: "manual_entry", // Generic API payload cannot choose the origin.
  });
  assert.equal(automatic.statusCode, 201);
  const normalRule = body<SavedRule>(automatic).rule;
  assert.equal(normalRule.purpose, "automation");
  const normalUpdate = await request(
    token,
    "PATCH",
    `/api/automation-rules/${normalRule.id}?profileId=${profileA}`,
    { name: "Automação legítima revisada", status: "active" },
  );
  assert.equal(normalUpdate.statusCode, 200);
  assert.equal(body<SavedRule>(normalUpdate).rule.status, "active");
  const activeAgain = await request(
    token,
    "GET",
    `/api/automation-rules?profileId=${profileA}&status=active`,
  );
  assert.equal(activeAgain.statusCode, 200);
  assert.deepEqual(
    body<{ rules: SavedRule["rule"][] }>(activeAgain).rules.map((rule) => rule.id),
    [normalRule.id],
  );

  // Category identifiers cannot cross financial-profile boundaries.
  const wrongCategory = await request(token, "POST", saveA, {
    description: "Item de outro perfil",
    categoryId: categoryB,
  });
  assert.equal(wrongCategory.statusCode, 400);
  assert.equal(errorCode(wrongCategory), "MANUAL_FILL_CATEGORY_INVALID");

  const other = await request(
    token,
    "POST",
    `/api/automation-rules/manual-entry?profileId=${profileB}`,
    { description: payload.description, categoryId: categoryB },
  );
  assert.equal(other.statusCode, 200);
  assert.notEqual(body<SavedRule>(other).rule.id, first.rule.id);
  assert.equal(body<SavedRule>(other).rule.financialProfileId, profileB);

  const count = await getPool().query<{ count: string }>(
    `select count(*)::text as count from "AutomationRule"
     where "financialProfileId" = $1 and "organizationId" is not null
       and "purpose" = 'manual_entry'`,
    [profileA],
  );
  assert.equal(Number(count.rows[0]?.count), 1);
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
  return body<{ session: { token: string } }>(response).session.token;
}

async function createProfile(token: string): Promise<string> {
  const result = await request(token, "POST", "/api/financial-profiles", {
    name: "Perfil de regra " + randomUUID().slice(0, 8),
    kind: "family",
  });
  assert.equal(result.statusCode, 201);
  return body<{ profile: { id: string } }>(result).profile.id;
}

async function createCategory(token: string, profileId: string): Promise<string> {
  const result = await request(token, "POST", `/api/categories?profileId=${profileId}`, {
    name: "Categoria de regra " + randomUUID().slice(0, 8),
    kind: "expense",
  });
  assert.equal(result.statusCode, 201);
  return body<{ category: { id: string } }>(result).category.id;
}

async function request(
  token: string,
  method: string,
  path: string,
  requestBody?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const req: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body: requestBody,
  };
  return (
    (await handleFinancialProfilesApiRequest(req)) ??
    (await handleAutomationRulesApiRequest(req)) ??
    (await handleApiRequest(req)) ?? {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { error: { code: "API_ROUTE_NOT_FOUND" } },
    }
  );
}

function body<T>(response: { body: unknown }): T {
  return response.body as T;
}

function errorCode(response: ApiResponse): string | undefined {
  return body<{ error?: { code?: string } }>(response).error?.code;
}
