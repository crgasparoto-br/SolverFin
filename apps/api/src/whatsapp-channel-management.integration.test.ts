import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closePool, query } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { handleWhatsappChannelManagementApiRequest } from "./whatsapp-channel-router.js";

const PERSONAL_PROFILE = "33333333-3333-4333-8333-333333333331";
const OTHER_OWNED_PROFILE = "33333333-3333-4333-8333-333333333332";

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.name : "Unknown integration error");
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const auth = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: { email: "demo@solverfin.example.invalid", password: "SolverFinDemo!2026" },
  });
  assert.equal(auth.statusCode, 201);
  const token = (auth.body as { session: { token: string } }).session.token;
  const accountId = "99" + BigInt("0x" + randomUUID().replace(/-/g, "").slice(0, 14)).toString();
  const providerEnv = {
    WHATSAPP_META_APP_SECRET: "integration-only-secret",
    WHATSAPP_META_VERIFY_TOKEN: "integration-only-verifier",
    WHATSAPP_META_PHONE_NUMBER_ID: accountId,
  };

  async function request(method: string, path: string, body?: unknown, bearer = token) {
    const url = new URL(path, "http://solverfin.integration.test");
    const apiRequest: ApiRequest = {
      method,
      pathname: url.pathname,
      query: url.searchParams,
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      body,
    };
    const result = await handleWhatsappChannelManagementApiRequest(apiRequest, providerEnv);
    assert.ok(result, `${method} ${path} must be handled by WhatsApp management`);
    return result;
  }

  function errorCode(response: ApiResponse): string | undefined {
    return (response.body as { error?: { code?: string } }).error?.code;
  }

  try {
    const unauthorized = await request(
      "POST",
      `/api/channels/whatsapp/pairings?profileId=${PERSONAL_PROFILE}`,
      {},
      "",
    );
    assert.equal(unauthorized.statusCode, 401, "phone identity does not authorize pairing");

    // The seeded user has three profiles. No default or heuristic can choose one.
    const missingProfile = await request("POST", "/api/channels/whatsapp/pairings", {});
    assert.equal(missingProfile.statusCode, 400);
    assert.equal(errorCode(missingProfile), "WHATSAPP_EXPLICIT_PROFILE_REQUIRED");

    const malformed = await request("POST", "/api/channels/whatsapp/pairings", {
      profileId: "not-a-uuid",
    });
    assert.equal(malformed.statusCode, 400);
    assert.equal(errorCode(malformed), "WHATSAPP_EXPLICIT_PROFILE_REQUIRED");

    const conflicting = await request(
      "POST",
      `/api/channels/whatsapp/pairings?profileId=${PERSONAL_PROFILE}`,
      { profileId: OTHER_OWNED_PROFILE },
    );
    assert.equal(conflicting.statusCode, 400, "body cannot redirect an explicit URL target");
    assert.equal(errorCode(conflicting), "WHATSAPP_EXPLICIT_PROFILE_REQUIRED");

    const duplicate = await request(
      "POST",
      `/api/channels/whatsapp/pairings?profileId=${PERSONAL_PROFILE}&profileId=${OTHER_OWNED_PROFILE}`,
      {},
    );
    assert.equal(duplicate.statusCode, 400, "multiple targets must never choose the first");
    assert.equal(errorCode(duplicate), "WHATSAPP_EXPLICIT_PROFILE_REQUIRED");

    const foreignProfile = await request(
      "POST",
      `/api/channels/whatsapp/pairings?profileId=${randomUUID()}`,
      {},
    );
    assert.equal(foreignProfile.statusCode, 403);

    const before = await query<{ count: string }>(
      'select count(*)::text as count from "WhatsappChannelLink" where "accountId"=$1',
      [accountId],
    );
    assert.equal(before[0]?.count, "0", "all rejected requests must have zero effects");

    const created = await request("POST", "/api/channels/whatsapp/pairings", {
      profileId: PERSONAL_PROFILE,
    });
    assert.equal(created.statusCode, 201);
    const pairing = (created.body as { pairing: { id: string; code: string } }).pairing;
    assert.equal(pairing.code.length, 32);
    const persisted = await query<{
      financialProfileId: string;
      challengeHash: string;
    }>('select "financialProfileId","challengeHash" from "WhatsappChannelLink" where "id"=$1', [
      pairing.id,
    ]);
    assert.equal(persisted[0]?.financialProfileId, PERSONAL_PROFILE);
    assert.notEqual(persisted[0]?.challengeHash, pairing.code, "never store pairing code raw");

    const otherProfile = await request(
      "GET",
      `/api/channels/whatsapp/links?profileId=${OTHER_OWNED_PROFILE}`,
    );
    assert.equal(otherProfile.statusCode, 200);
    assert.deepEqual((otherProfile.body as { links: unknown[] }).links, []);

    const ownProfile = await request(
      "GET",
      `/api/channels/whatsapp/links?profileId=${PERSONAL_PROFILE}`,
    );
    assert.equal(ownProfile.statusCode, 200);
    const links = (ownProfile.body as { links: Array<Record<string, unknown>> }).links;
    const linked = links.find((link) => link.id === pairing.id);
    assert.ok(linked, "only the explicitly selected profile can list the new pairing");
    assert.equal("code" in linked, false, "links must never return pairing code");
    assert.equal("challengeHash" in linked, false);

    const crossProfileCancel = await request(
      "POST",
      `/api/channels/whatsapp/pairings/${pairing.id}/cancel?profileId=${OTHER_OWNED_PROFILE}`,
    );
    assert.equal(crossProfileCancel.statusCode, 409);
    const cancel = await request(
      "POST",
      `/api/channels/whatsapp/pairings/${pairing.id}/cancel?profileId=${PERSONAL_PROFILE}`,
      { profileId: PERSONAL_PROFILE },
    );
    assert.equal(cancel.statusCode, 200);
    const cleared = await query<{ challengeHash: string | null; state: string }>(
      'select "challengeHash","state" from "WhatsappChannelLink" where "id"=$1',
      [pairing.id],
    );
    assert.deepEqual(cleared, [{ challengeHash: null, state: "cancelled" }]);
  } finally {
    await query('delete from "WhatsappChannelLink" where "accountId"=$1', [accountId]);
  }
}
