import assert from "node:assert/strict";

import { financialInstitutionCatalog } from "@solverfin/domain";

import { MASTER_EMAILS_ENV_KEY } from "./admin-auth.js";
import {
  buildAdminInstitutionsPayload,
  handleAdminInstitutionsApiRequest,
} from "./admin-institutions-router.js";
import { auth, demoUser } from "./auth-service.js";
import type { ApiRequest, ApiResponse } from "./router.js";

await unknownAdminRoutesAreIgnored();
await adminInstitutionsRequireAuthentication();
await adminInstitutionsBlockRegularUsers();
await adminInstitutionsAllowConfiguredMaster();
await adminInstitutionRefreshIsIdempotent();
adminInstitutionsPayloadSummarizesCatalog();

async function unknownAdminRoutesAreIgnored(): Promise<void> {
  const response = await handleAdminInstitutionsApiRequest(
    buildRequest("GET", "/api/admin/institutions/unknown"),
  );

  assert.equal(response, undefined);
}

async function adminInstitutionsRequireAuthentication(): Promise<void> {
  const response = await handleAdminInstitutionsApiRequest(
    buildRequest("GET", "/api/admin/institutions"),
  );

  assert.ok(response);
  assert.equal(response.statusCode, 401);
  assert.equal(readErrorCode(response), "AUTH_SESSION_REQUIRED");
}

async function adminInstitutionsBlockRegularUsers(): Promise<void> {
  await withEnv(MASTER_EMAILS_ENV_KEY, "master@solverfin.example.invalid", async () => {
    const response = await handleAdminInstitutionsApiRequest(
      buildRequest("GET", "/api/admin/institutions", undefined, rememberSession("admin-regular")),
    );

    assert.ok(response);
    assert.equal(response.statusCode, 403);
    assert.equal(readErrorCode(response), "AUTH_ADMIN_REQUIRED");
  });
}

async function adminInstitutionsAllowConfiguredMaster(): Promise<void> {
  await withEnv(MASTER_EMAILS_ENV_KEY, demoUser.email, async () => {
    const response = await handleAdminInstitutionsApiRequest(
      buildRequest("GET", "/api/admin/institutions", undefined, rememberSession("admin-master")),
    );

    assert.ok(response);
    assert.equal(response.statusCode, 200);
    assert.equal(readInstitutionCount(response), financialInstitutionCatalog.length);
  });
}

async function adminInstitutionRefreshIsIdempotent(): Promise<void> {
  await withEnv(MASTER_EMAILS_ENV_KEY, demoUser.email, async () => {
    const response = await handleAdminInstitutionsApiRequest(
      buildRequest("POST", "/api/admin/institutions/refresh", {}, rememberSession("admin-refresh")),
    );

    assert.ok(response);
    assert.equal(response.statusCode, 200);
    assert.equal(readOperationStatus(response), "already_up_to_date");
    assert.equal(readInstitutionCount(response), financialInstitutionCatalog.length);
  });
}

function adminInstitutionsPayloadSummarizesCatalog(): void {
  const payload = buildAdminInstitutionsPayload("2026-07-02T00:00:00.000Z");

  assert.equal(payload.summary.total, financialInstitutionCatalog.length);
  assert.equal(
    payload.summary.withLogo,
    financialInstitutionCatalog.filter((institution) => institution.logoAssetPath).length,
  );
  assert.equal(
    payload.summary.usingFallback,
    financialInstitutionCatalog.filter((institution) => !institution.logoAssetPath).length,
  );
  assert.equal(payload.summary.updatedAt, "2026-07-02T00:00:00.000Z");
}

function rememberSession(sessionId: string): string {
  auth.rememberSession({
    id: sessionId,
    userId: demoUser.id,
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    expiresAt: new Date("2099-07-02T00:00:00.000Z"),
  });

  return sessionId;
}

function buildRequest(
  method: string,
  path: string,
  body?: unknown,
  sessionId?: string,
): ApiRequest {
  const url = new URL(path, "http://solverfin.test");

  return {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: sessionId ? { authorization: `Bearer ${sessionId}` } : {},
    body,
  };
}

function readErrorCode(response: ApiResponse): string | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (response.body as { error?: { code?: string } }).error?.code;
}

function readInstitutionCount(response: ApiResponse): number | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (response.body as { institutions?: unknown[] }).institutions?.length;
}

function readOperationStatus(response: ApiResponse): string | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (response.body as { operation?: { status?: string } }).operation?.status;
}

async function withEnv(
  key: string,
  value: string,
  action: () => void | Promise<void>,
): Promise<void> {
  const previousValue = process.env[key];
  process.env[key] = value;

  try {
    await action();
  } finally {
    if (previousValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previousValue;
    }
  }
}
