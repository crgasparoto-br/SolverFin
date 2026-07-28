import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveReportsCanonicalLocation } from "./reports-canonical-location.js";

describe("reports canonical location", () => {
  it("removes an empty accountId produced by the no-JavaScript all-accounts option", () => {
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          "http://localhost/relatorios?view=category-evolution&interval=monthly&accountId=&profileId=profile-1",
        ),
      ),
      "/relatorios?view=category-evolution&interval=monthly&profileId=profile-1",
    );
  });

  it("keeps a selected account and a malformed non-empty value for normal validation", () => {
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL(
          "http://localhost/relatorios?view=category-evolution&accountId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ),
      ),
      undefined,
    );
    assert.equal(
      resolveReportsCanonicalLocation(
        new URL("http://localhost/relatorios?view=category-evolution&accountId=invalid"),
      ),
      undefined,
    );
  });
});
