import assert from "node:assert/strict";

import { closePool } from "./db.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
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
  assertIntegrationDatabaseConfigured();

  const token = await loginAndReadToken();
  const initialProfiles = await listProfiles(token);
  const personalProfile = initialProfiles.find((profile) => profile.kind === "personal");

  assert.ok(personalProfile, "Seed should expose a personal profile");

  const createdProfile = await createProfile(token);
  await assertProfileCanBeSelectedWithoutMixingSeedData(token, createdProfile.id);
  await assertOtherProfileCannotBeSelected(token);
  await assertProfileCanBeUpdatedAndArchived(token, createdProfile.id);
}

async function listProfiles(token: string): Promise<ApiFinancialProfile[]> {
  const response = await apiRequest(token, "GET", "/api/financial-profiles");

  assert.equal(response.statusCode, 200);

  return readBody<{ profiles: ApiFinancialProfile[] }>(response).profiles;
}

async function createProfile(token: string): Promise<ApiFinancialProfile> {
  const suffix = Date.now().toString(36);
  const response = await apiRequest(token, "POST", "/api/financial-profiles", {
    name: `Familia teste ${suffix}`,
    kind: "family",
  });

  assert.equal(response.statusCode, 201);
  const profile = readBody<{ profile: ApiFinancialProfile }>(response).profile;

  assert.equal(profile.kind, "family");
  assert.equal(profile.status, "active");

  return profile;
}

async function assertProfileCanBeSelectedWithoutMixingSeedData(
  token: string,
  profileId: string,
): Promise<void> {
  const response = await apiRequest(token, "GET", `/api/accounts?profileId=${profileId}`);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(readBody<{ accounts: unknown[] }>(response).accounts, []);
}

async function assertOtherProfileCannotBeSelected(token: string): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    "/api/accounts?profileId=33333333-3333-4333-8333-999999999999",
  );

  assert.equal(response.statusCode, 403);
  assert.equal(readErrorCode(response), "TENANT_ACCESS_DENIED");
}

async function assertProfileCanBeUpdatedAndArchived(
  token: string,
  profileId: string,
): Promise<void> {
  const updateResponse = await apiRequest(token, "PATCH", `/api/financial-profiles/${profileId}`, {
    name: "Familia atualizada",
    kind: "family",
  });

  assert.equal(updateResponse.statusCode, 200);
  assert.equal(readBody<{ profile: ApiFinancialProfile }>(updateResponse).profile.name, "Familia atualizada");

  const archiveResponse = await apiRequest(
    token,
    "POST",
    `/api/financial-profiles/${profileId}/archive`,
  );

  assert.equal(archiveResponse.statusCode, 200);
  assert.equal(readBody<{ profile: ApiFinancialProfile }>(archiveResponse).profile.status, "archived");
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
  const profilesResponse = await handleFinancialProfilesApiRequest(request);
  const response = profilesResponse ?? (await handleApiRequest(request));

  assert.ok(response, `${method} ${path} should be handled by the API router`);

  return response;
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return response.body as TBody;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface ApiFinancialProfile {
  id: string;
  name: string;
  kind: string;
  status: string;
}
