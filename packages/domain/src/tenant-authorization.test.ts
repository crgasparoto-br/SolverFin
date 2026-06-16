import type { Account } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  deleteTenantScopedResource,
  getTenantScopedResource,
  listTenantScopedResources,
  TenantAuthorizationError,
  updateTenantScopedResource,
} from "./tenant-authorization.js";

const tenantA: TenantContext = {
  userId: "user-demo-a",
  organizationId: "org-demo-a",
  financialProfileId: "profile-demo-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-demo-b",
  organizationId: "org-demo-b",
  financialProfileId: "profile-demo-b",
  financialProfileKind: "business",
};

const accountA = createAccountFixture(tenantA, "account-demo-a");
const accountB = createAccountFixture(tenantB, "account-demo-b");

testUserCanReadOwnTenantResource();
testDirectIdFromOtherTenantReturnsNotFound();
testListAlwaysFiltersByTenant();
testCreatePayloadUsesActiveTenant();
testUpdateRejectsManipulatedTenantPayload();
testDeleteRejectsOtherTenantResource();

function testUserCanReadOwnTenantResource(): void {
  const account = getTenantScopedResource(tenantA, accountA);

  assertEqual(account.id, accountA.id, "own resource should be readable");
}

function testDirectIdFromOtherTenantReturnsNotFound(): void {
  assertTenantAuthorizationError(
    () => getTenantScopedResource(tenantA, accountB),
    "TENANT_RESOURCE_NOT_FOUND",
    404,
  );
}

function testListAlwaysFiltersByTenant(): void {
  const accounts = listTenantScopedResources(tenantA, [accountA, accountB]);

  assertEqual(accounts.length, 1, "list should only include active tenant rows");
  assertEqual(accounts[0]?.id, accountA.id, "list should keep the owned account");
}

function testCreatePayloadUsesActiveTenant(): void {
  const payload = applyTenantScope(tenantA, {
    organizationId: tenantB.organizationId,
    financialProfileId: tenantB.financialProfileId,
    name: "Conta manipulada no payload",
    kind: "checking" as const,
  });

  assertEqual(payload.organizationId, tenantA.organizationId, "create should use active org");
  assertEqual(
    payload.financialProfileId,
    tenantA.financialProfileId,
    "create should use active profile",
  );
}

function testUpdateRejectsManipulatedTenantPayload(): void {
  assertTenantAuthorizationError(
    () =>
      updateTenantScopedResource(tenantA, accountA, {
        organizationId: tenantB.organizationId,
      }),
    "TENANT_PAYLOAD_SCOPE_FORBIDDEN",
    403,
  );
}

function testDeleteRejectsOtherTenantResource(): void {
  assertTenantAuthorizationError(
    () => deleteTenantScopedResource(tenantA, accountB),
    "TENANT_RESOURCE_NOT_FOUND",
    404,
  );
}

function createAccountFixture(context: TenantContext, id: string): Account {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: `Conta ${id}`,
    kind: "checking",
    status: "active",
    currency: "BRL",
    openingBalanceMinor: 0,
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z",
  };
}

function assertTenantAuthorizationError(
  action: () => void,
  expectedCode: TenantAuthorizationError["code"],
  expectedStatusCode: TenantAuthorizationError["statusCode"],
): void {
  try {
    action();
  } catch (error) {
    if (
      error instanceof TenantAuthorizationError &&
      error.code === expectedCode &&
      error.statusCode === expectedStatusCode
    ) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected tenant authorization error ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
