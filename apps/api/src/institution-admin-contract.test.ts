import assert from "node:assert/strict";

import { financialInstitutionCatalog } from "@solverfin/domain";

import { MASTER_EMAILS_ENV_KEY } from "./admin-auth.js";
import {
  buildAdminInstitutionsPayload,
  handleAdminInstitutionsApiRequest,
  setLogoStorageAdapterForTests,
} from "./admin-institutions-router.js";
import { auth, demoUser } from "./auth-service.js";
import { clearUploadedInstitutionLogosForTests } from "./institution-logo-upload.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const validPngBase64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]).toString("base64");

adminPayloadMirrorsGlobalCatalogWithoutReorderingOrDuplication();
await logoUploadRequiresAuthenticationBeforeValidation();
await logoUploadRejectsInvalidFileForMaster();
await logoUploadStorageFailureKeepsPreviousState();

function adminPayloadMirrorsGlobalCatalogWithoutReorderingOrDuplication(): void {
  clearUploadedInstitutionLogosForTests();
  const payload = buildAdminInstitutionsPayload("2026-07-02T00:00:00.000Z");

  assert.equal(payload.summary.total, financialInstitutionCatalog.length);
  assert.deepEqual(
    payload.institutions.map((institution) => institution.key),
    financialInstitutionCatalog.map((institution) => institution.key),
  );
  assert.equal(
    new Set(payload.institutions.map((institution) => institution.key)).size,
    payload.summary.total,
  );

  for (const catalogInstitution of financialInstitutionCatalog) {
    const adminInstitution = payload.institutions.find(
      (institution) => institution.key === catalogInstitution.key,
    );

    assert.ok(adminInstitution, `${catalogInstitution.key} must be exposed by Admin API payload`);
    assert.equal(adminInstitution.label, catalogInstitution.label);
    assert.equal(adminInstitution.description, catalogInstitution.description);
    assert.equal(adminInstitution.fallbackLabel, catalogInstitution.fallbackLabel);
    assert.equal(adminInstitution.status, catalogInstitution.status);
    assert.equal(
      adminInstitution.financialInstitutionCode,
      catalogInstitution.financialInstitutionCode,
    );
  }
}

async function logoUploadRequiresAuthenticationBeforeValidation(): Promise<void> {
  const response = await handleAdminInstitutionsApiRequest(
    buildRequest("POST", "/api/admin/institutions/bradesco/logo", {
      mimeType: "image/svg+xml",
      contentBase64: "",
    }),
  );

  assert.ok(response);
  assert.equal(response.statusCode, 401);
  assert.equal(readErrorCode(response), "AUTH_SESSION_REQUIRED");
}

async function logoUploadRejectsInvalidFileForMaster(): Promise<void> {
  setLogoStorageAdapterForTests({
    async putObject() {
      throw new Error("Invalid logo validation must run before storage.");
    },
  });

  try {
    await withTemporaryEnv(MASTER_EMAILS_ENV_KEY, demoUser.email, async () => {
      const response = await handleAdminInstitutionsApiRequest(
        buildRequest(
          "POST",
          "/api/admin/institutions/bradesco/logo",
          { mimeType: "image/svg+xml", contentBase64: validPngBase64 },
          rememberSession("invalid-logo-master-session"),
        ),
      );

      assert.ok(response);
      assert.equal(response.statusCode, 400);
      assert.equal(readErrorCode(response), "INSTITUTION_LOGO_UNSUPPORTED_TYPE");
    });
  } finally {
    setLogoStorageAdapterForTests(undefined);
  }
}

async function logoUploadStorageFailureKeepsPreviousState(): Promise<void> {
  clearUploadedInstitutionLogosForTests();
  setLogoStorageAdapterForTests({
    async putObject() {
      throw Object.assign(new Error("R2 unavailable"), {
        code: "INSTITUTION_LOGO_STORAGE_UNAVAILABLE",
        statusCode: 502,
      });
    },
  });

  try {
    await withTemporaryEnv(MASTER_EMAILS_ENV_KEY, demoUser.email, async () => {
      const response = await handleAdminInstitutionsApiRequest(
        buildRequest(
          "POST",
          "/api/admin/institutions/inter/logo",
          { mimeType: "image/png", contentBase64: validPngBase64 },
          rememberSession("storage-failure-master-session"),
        ),
      );

      assert.ok(response);
      assert.equal(response.statusCode, 502);
      assert.equal(readErrorCode(response), "INSTITUTION_LOGO_STORAGE_UNAVAILABLE");
      assert.equal(
        buildAdminInstitutionsPayload().institutions.find(
          (institution) => institution.key === "inter",
        )?.logoStatus,
        "local_asset",
      );
    });
  } finally {
    setLogoStorageAdapterForTests(undefined);
    clearUploadedInstitutionLogosForTests();
  }
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
