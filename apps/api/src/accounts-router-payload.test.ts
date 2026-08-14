import assert from "node:assert/strict";

import { buildCreateAccountPayload, buildUpdateAccountPayload } from "./accounts-router.js";

testCreatePayloadIgnoresLegacyIdentifier();
testUpdatePayloadIgnoresLegacyIdentifier();

function testCreatePayloadIgnoresLegacyIdentifier(): void {
  const payload = buildCreateAccountPayload({
    name: "Conta de teste",
    kind: "checking",
    agencyIdentifier: "0001",
    accountIdentifier: "12345-6",
    maskedIdentifier: "legacy-write-attempt",
  });

  assert.equal(payload.agencyIdentifier, "0001");
  assert.equal(payload.accountIdentifier, "12345-6");
  assert.equal("maskedIdentifier" in payload, false);
}

function testUpdatePayloadIgnoresLegacyIdentifier(): void {
  const payload = buildUpdateAccountPayload({
    agencyIdentifier: "0002",
    accountIdentifier: "99887-1",
    maskedIdentifier: "legacy-write-attempt",
  });

  assert.equal(payload.agencyIdentifier, "0002");
  assert.equal(payload.accountIdentifier, "99887-1");
  assert.equal("maskedIdentifier" in payload, false);
}
