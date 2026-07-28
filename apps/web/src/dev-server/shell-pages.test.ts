import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { solverFinShellRoutes } from "../app-shell/routes.js";
import {
  solverFinSsrStyleContracts,
  validateSsrStyleContractParity,
} from "./ssr-style-contract.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("SSR shell pages", () => {
  it("derives exact route and module coverage from the canonical available routes", () => {
    assert.deepEqual(
      validateSsrStyleContractParity(solverFinShellRoutes, solverFinSsrStyleContracts),
      [],
    );
  });

  for (const contract of solverFinSsrStyleContracts) {
    it(`${contract.path} keeps its renderer connected to the expected SSR shell`, () => {
      const source = readFileSync(join(currentDir, contract.moduleFileName), "utf8");

      if (contract.shell === "public") {
        assert.match(source, /renderLoginPage/);
        assert.match(source, /<style>\$\{loginCss\(\)\}<\/style>/);
        return;
      }

      assert.match(source, /renderAuthenticatedShellDocument/);
      assert.match(source, /sharedShellStyles\(\)/);
    });
  }
});
