import assert from "node:assert/strict";

import { closePool } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";
const MISSING_CATEGORY_ID = "00000000-0000-4000-8000-000000000514";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for category integration tests.");
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, suffix);
  const rootExpense = await createCategory(token, {
    name: `Alimentação ${suffix}`,
    kind: "expense",
  });
  const childExpense = await createCategory(token, {
    name: `Mercado ${suffix}`,
    kind: "expense",
    parentCategoryId: rootExpense.id,
  });
  const incomeCategory = await createCategory(token, {
    name: `Salário ${suffix}`,
    kind: "income",
  });
  const archivedCategory = await createCategory(token, {
    name: `Arquivada ${suffix}`,
    kind: "expense",
  });
  const archiveResponse = await apiRequest(
    token,
    "POST",
    `/api/categories/${archivedCategory.id}/archive`,
  );
  assert.equal(archiveResponse.statusCode, 200);
  const otherProfileCategory = await createCategory(
    token,
    { name: `Outro perfil ${suffix}`, kind: "expense" },
    MEI_PROFILE_ID,
  );

  await assertCanonicalCategoryContract(token, childExpense.id, rootExpense.id);
  await assertImportCategoryValidation(token, {
    accountId,
    childExpenseId: childExpense.id,
    incomeCategoryId: incomeCategory.id,
    archivedCategoryId: archivedCategory.id,
    otherProfileCategoryId: otherProfileCategory.id,
    suffix,
  });
}

async function assertCanonicalCategoryContract(
  token: string,
  childCategoryId: string,
  parentCategoryId: string,
): Promise<void> {
  const response = await apiRequest(token, "GET", "/api/categories?status=all");
  assert.equal(response.statusCode, 200);
  const categories = readBody<{
    categories: Array<{
      id: string;
      parentCategoryId?: string;
      status: string;
    }>;
  }>(response).categories;
  const child = categories.find((category) => category.id === childCategoryId);

  assert.ok(child, "The canonical category listing must include the created child category");
  assert.equal(child.parentCategoryId, parentCategoryId);
}

async function assertImportCategoryValidation(
  token: string,
  fixtures: {
    accountId: string;
    childExpenseId: string;
    incomeCategoryId: string;
    archivedCategoryId: string;
    otherProfileCategoryId: string;
    suffix: string;
  },
): Promise<void> {
  const createResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `category-hierarchy-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-21,Hierarquia ${fixtures.suffix},-12.34`,
    accountId: fixtures.accountId,
    consentAccepted: true,
  });
  assert.equal(createResponse.statusCode, 201);
  const created = readBody<ImportDetail>(createResponse);
  const suggestion = created.suggestions[0];
  assert.ok(suggestion, "Expected one import suggestion");

  await assertCategoryRejected(
    token,
    created.importBatch.id,
    suggestion.id,
    MISSING_CATEGORY_ID,
    "IMPORT_CATEGORY_INVALID",
  );
  await assertCategoryRejected(
    token,
    created.importBatch.id,
    suggestion.id,
    fixtures.archivedCategoryId,
    "IMPORT_CATEGORY_INVALID",
  );
  await assertCategoryRejected(
    token,
    created.importBatch.id,
    suggestion.id,
    fixtures.otherProfileCategoryId,
    "IMPORT_CATEGORY_INVALID",
  );
  await assertCategoryRejected(
    token,
    created.importBatch.id,
    suggestion.id,
    fixtures.incomeCategoryId,
    "IMPORT_CATEGORY_KIND_MISMATCH",
  );

  const updateResponse = await apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${created.importBatch.id}/suggestions/${suggestion.id}`,
    { categoryId: fixtures.childExpenseId },
  );
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(
    readBody<{ suggestion: ImportSuggestion }>(updateResponse).suggestion.payload.categoryId,
    fixtures.childExpenseId,
  );

  const reopenedResponse = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${created.importBatch.id}`,
  );
  assert.equal(reopenedResponse.statusCode, 200);
  const reopened = readBody<ImportDetail>(reopenedResponse).suggestions[0];
  assert.equal(reopened?.payload.categoryId, fixtures.childExpenseId);

  const approvalResponse = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/suggestions/${suggestion.id}/approve`,
  );
  assert.equal(approvalResponse.statusCode, 200);
  assert.equal(
    readBody<{ transaction: { categoryId?: string } }>(approvalResponse).transaction.categoryId,
    fixtures.childExpenseId,
  );
}

async function assertCategoryRejected(
  token: string,
  importBatchId: string,
  suggestionId: string,
  categoryId: string,
  expectedCode: string,
): Promise<void> {
  const response = await apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${importBatchId}/suggestions/${suggestionId}`,
    { categoryId },
  );

  assert.equal(response.statusCode, 400);
  assert.equal(readErrorCode(response), expectedCode);
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta hierarquia ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function createCategory(
  token: string,
  payload: { name: string; kind: "income" | "expense"; parentCategoryId?: string },
  profileId?: string,
): Promise<{ id: string }> {
  const query = profileId === undefined ? "" : `?profileId=${encodeURIComponent(profileId)}`;
  const response = await apiRequest(token, "POST", `/api/categories${query}`, payload);
  assert.equal(response.statusCode, 201);
  return readBody<{ category: { id: string } }>(response).category;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: { email: "demo@solverfin.example.invalid", password: "SolverFinDemo!2026" },
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

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

interface ImportSuggestion {
  id: string;
  payload: {
    categoryId?: string;
  };
}

interface ImportDetail {
  importBatch: { id: string };
  suggestions: ImportSuggestion[];
}
