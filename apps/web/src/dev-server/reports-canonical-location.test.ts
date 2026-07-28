import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveReportsCanonicalLocation } from "./reports-canonical-location.js";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("reports canonical location", () => {
  it("removes one empty source identifier produced by a legacy no-JavaScript all option", () => {
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          "http://localhost/relatorios?view=category-evolution&interval=monthly&accountId=&profileId=profile-1",
        ),
      ),
      "/relatorios?view=category-evolution&interval=monthly&profileId=profile-1",
    );
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          "http://localhost/relatorios?view=category-evolution&interval=monthly&cardId=&profileId=profile-1",
        ),
      ),
      "/relatorios?view=category-evolution&interval=monthly&profileId=profile-1",
    );
  });

  it("keeps simultaneous source parameters for explicit filter validation", () => {
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          "http://localhost/relatorios?view=category-evolution&interval=monthly&accountId=&cardId=&profileId=profile-1",
        ),
      ),
      undefined,
    );
  });

  it("converts the no-JavaScript origin field to the canonical account or card parameter", () => {
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          `http://localhost/relatorios?view=category-evolution&interval=monthly&origin=account%3A${ACCOUNT_ID}&profileId=profile-1`,
        ),
      ),
      `/relatorios?view=category-evolution&interval=monthly&profileId=profile-1&accountId=${ACCOUNT_ID}`,
    );
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          `http://localhost/relatorios?view=category-evolution&interval=monthly&origin=card%3A${CARD_ID}&profileId=profile-1`,
        ),
      ),
      `/relatorios?view=category-evolution&interval=monthly&profileId=profile-1&cardId=${CARD_ID}`,
    );
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          "http://localhost/relatorios?view=category-evolution&interval=monthly&origin=&profileId=profile-1",
        ),
      ),
      "/relatorios?view=category-evolution&interval=monthly&profileId=profile-1",
    );
  });

  it("keeps canonical selected and malformed values for normal validation", () => {
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(`http://localhost/relatorios?view=category-evolution&accountId=${ACCOUNT_ID}`),
      ),
      undefined,
    );
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(`http://localhost/relatorios?view=category-evolution&cardId=${CARD_ID}`),
      ),
      undefined,
    );
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL("http://localhost/relatorios?view=category-evolution&cardId=invalid"),
      ),
      undefined,
    );
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL("http://localhost/relatorios?view=category-evolution&origin=invalid"),
      ),
      undefined,
    );
  });
});
