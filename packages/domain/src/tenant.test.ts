import {
  assertTenantScopedEntity,
  createFinancialProfile,
  createOrganization,
  isTenantScopedTo,
  resolveTenantContext,
  TenantError,
} from "./tenant.js";
import type { Account, FinancialProfile, User } from "./index.js";

const activeUser: User = {
  id: "user-demo-1",
  email: "demo@solverfin.example.invalid",
  displayName: "Usuario Demo",
  status: "active",
  createdAt: "2026-06-15T10:00:00.000Z",
  updatedAt: "2026-06-15T10:00:00.000Z",
};

const otherUser: User = {
  ...activeUser,
  id: "user-demo-2",
  email: "outro@solverfin.example.invalid",
};

const now = "2026-06-15T10:05:00.000Z";
const organization = createOrganization({
  id: "org-demo-1",
  owner: activeUser,
  name: " Organizacao Demo ",
  now,
});
const personalProfile = createFinancialProfile({
  id: "profile-demo-1",
  organization,
  owner: activeUser,
  name: " Pessoal ",
  kind: "personal",
  now,
});

testCreateOrganizationAndFinancialProfile();
testResolveSingleActiveContext();
testResolveRequestedContextWhenUserHasMultipleProfiles();
testEntityWithoutTenantIsRejected();
testOtherTenantEntityIsRejected();
testOtherUserProfileIsNotAccessible();
testMultipleProfilesRequireExplicitContext();

function testCreateOrganizationAndFinancialProfile(): void {
  assertEqual(
    organization.name,
    "Organizacao Demo",
    "organization name should be normalized",
  );
  assertEqual(
    organization.ownerUserId,
    activeUser.id,
    "organization should keep the owner user id",
  );
  assertEqual(
    personalProfile.name,
    "Pessoal",
    "financial profile name should be normalized",
  );
  assertEqual(
    personalProfile.organizationId,
    organization.id,
    "financial profile should belong to the organization",
  );
  assertEqual(
    personalProfile.ownerUserId,
    activeUser.id,
    "financial profile should keep owner",
  );
}

function testResolveSingleActiveContext(): void {
  const context = resolveTenantContext({
    user: activeUser,
    profiles: [personalProfile],
  });

  assertEqual(context.userId, activeUser.id, "context should keep user id");
  assertEqual(
    context.organizationId,
    organization.id,
    "context should keep organization id",
  );
  assertEqual(
    context.financialProfileId,
    personalProfile.id,
    "context should keep financial profile id",
  );
}

function testResolveRequestedContextWhenUserHasMultipleProfiles(): void {
  const meiProfile = createFinancialProfile({
    id: "profile-demo-2",
    organization,
    owner: activeUser,
    name: "MEI Demo",
    kind: "mei",
    now,
  });

  const context = resolveTenantContext({
    user: activeUser,
    profiles: [personalProfile, meiProfile],
    requestedFinancialProfileId: meiProfile.id,
  });

  assertEqual(
    context.financialProfileId,
    meiProfile.id,
    "requested active context should be selected",
  );
  assertEqual(
    context.financialProfileKind,
    "mei",
    "context should expose profile kind",
  );
}

function testEntityWithoutTenantIsRejected(): void {
  const context = resolveTenantContext({
    user: activeUser,
    profiles: [personalProfile],
  });

  assertTenantError(
    () => assertTenantScopedEntity(context, {}),
    "TENANT_SCOPE_REQUIRED",
  );
}

function testOtherTenantEntityIsRejected(): void {
  const context = resolveTenantContext({
    user: activeUser,
    profiles: [personalProfile],
  });
  const account = createAccountFixture({
    organizationId: "org-demo-2",
    financialProfileId: personalProfile.id,
  });

  assertTenantError(
    () => assertTenantScopedEntity(context, account),
    "TENANT_ACCESS_DENIED",
  );
  assertEqual(
    isTenantScopedTo(context, account),
    false,
    "tenant helper should detect mismatch",
  );
}

function testOtherUserProfileIsNotAccessible(): void {
  const otherOrganization = createOrganization({
    id: "org-demo-2",
    owner: otherUser,
    name: "Outro Tenant Demo",
    now,
  });
  const otherProfile = createFinancialProfile({
    id: "profile-demo-3",
    organization: otherOrganization,
    owner: otherUser,
    name: "Outro Perfil",
    kind: "business",
    now,
  });

  assertTenantError(
    () =>
      resolveTenantContext({
        user: activeUser,
        profiles: [personalProfile, otherProfile],
        requestedFinancialProfileId: otherProfile.id,
      }),
    "TENANT_ACCESS_DENIED",
  );
}

function testMultipleProfilesRequireExplicitContext(): void {
  const businessProfile: FinancialProfile = {
    ...personalProfile,
    id: "profile-demo-4",
    name: "Negocio Demo",
    kind: "business",
  };

  assertTenantError(
    () =>
      resolveTenantContext({
        user: activeUser,
        profiles: [personalProfile, businessProfile],
      }),
    "TENANT_CONTEXT_REQUIRED",
  );
}

function createAccountFixture(
  scope: Pick<Account, "organizationId" | "financialProfileId">,
): Account {
  return {
    id: "account-demo-1",
    organizationId: scope.organizationId,
    financialProfileId: scope.financialProfileId,
    name: "Conta Demo",
    kind: "checking",
    status: "active",
    currency: "BRL",
    openingBalanceMinor: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function assertTenantError(action: () => void, expectedCode: TenantError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof TenantError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected tenant error ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
