import assert from "node:assert/strict";

import { MASTER_EMAILS_ENV_KEY } from "./admin-auth.js";
import {
  handleAdminInstitutionsApiRequest,
  setLogoStorageAdapterForTests,
} from "./admin-institutions-router.js";
import { auth, demoUser } from "./auth-service.js";
import { clearUploadedInstitutionLogosForTests } from "./institution-logo-upload.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const validPngBase64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]).toString("base64");

await logoUploadBlocksRegularUser();
await logoUploadAllowsConfiguredMaster();

async function logoUploadBlocksRegularUser(): Promise<void> {
  await withTemporaryEnv(MASTER_EMAILS_ENV_KEY, "root@solverfin.example.invalid", async () => {
    const response = await handleAdminInstitutionsApiRequest(
      buildRequest(
        "POST",
        "/api/admin/institutions/bradesco/logo",
        buildLogoBody(),
        rememberSession("logo-regular-session"),
      ),
    );

    assert.ok(response);
    assert.equal(response.statusCode, 403);
    assert.equal(readErrorCode(response), "AUTH_ADMIN_REQUIRED");
  });
}

async function logoUploadAllowsConfiguredMaster(): Promise<void> {
  clearUploadedInstitutionLogosForTests();
  setLogoStorageAdapterForTests({
    async putObject(input) {
      return {
        objectKey: input.objectKey,
        publicUrl: `https://cdn.example.invalid/${input.objectKey}`,
      };
    },
  });

  try {
    await withTemporaryEnv(MASTER_EMAILS_ENV_KEY, demoUser.email, async () => {
      const response = await handleAdminInstitutionsApiRequest(
        buildRequest(
          "POST",
          "/api/admin/institutions/bradesco/logo",
          buildLogoBody(),
          rememberSession("logo-master-session"),
        ),
      );

      assert.ok(response);
      assert.equal(response.statusCode, 200);
      assert.equal(readOperationStatus(response), "uploaded");
      assert.equal(readUploadedInstitution(response), "bradesco");
      assert.equal(readInstitutionLogoStatus(response, "bradesco"), "r2_asset");
    });
  } finally {
    setLogoStorageAdapterForTests(undefined);
    clearUploadedInstitutionLogosForTests();
  }
}

function buildLogoBody(): Record<string, string> {
  return {
    fileName: "bradesco.png",
    mimeType: "image/png",
    contentBase64: validPngBase64,
  };
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

function buildRequest(method: string, path: string, body: unknown, sessionId: string): ApiRequest {
  const url = new URL(path, "http://solverfin.test");

  return {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${sessionId}` },
    body,
  };
}

function readErrorCode(response: ApiResponse): string | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (response.body as { error?: { code?: string } }).error?.code;
}

function readOperationStatus(response: ApiResponse): string | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (response.body as { operation?: { status?: string } }).operation?.status;
}

function readUploadedInstitution(response: ApiResponse): string | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (response.body as { logo?: { institutionKey?: string } }).logo?.institutionKey;
}

function readInstitutionLogoStatus(response: ApiResponse, key: string): string | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (
    response.body as { institutions?: Array<{ key: string; logoStatus?: string }> }
  ).institutions?.find((institution) => institution.key === key)?.logoStatus;
}

async function withTemporaryEnv(
  key: string,
  value: string,
  action: () => Promise<void>,
): Promise<void> {
  const previous = process.env[key];
  process.env[key] = value;

  try {
    await action();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}
