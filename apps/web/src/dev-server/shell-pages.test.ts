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

const readModuleSource = (moduleFileName: string): string =>
  readFileSync(join(currentDir, moduleFileName), "utf8");

const resolveAuthenticatedSources = (
  routeId: string,
  moduleFileName: string,
): { renderer: string; styles: string } => {
  if (routeId === "accountsCards") {
    return {
      renderer: readModuleSource("accounts-cards/page.js"),
      styles: readModuleSource("accounts-cards/styles.js"),
    };
  }

  const source = readModuleSource(moduleFileName);
  return { renderer: source, styles: source };
};

describe("SSR shell pages", () => {
  it("derives exact route and module coverage from the canonical available routes", () => {
    assert.deepEqual(
      validateSsrStyleContractParity(solverFinShellRoutes, solverFinSsrStyleContracts),
      [],
    );
  });

  for (const contract of solverFinSsrStyleContracts) {
    it(`${contract.path} keeps its renderer connected to the expected SSR shell`, () => {
      const source = readModuleSource(contract.moduleFileName);

      if (contract.shell === "public") {
        assert.match(source, /renderLoginPage/);
        assert.match(source, /<style>\$\{loginCss\(\)\}<\/style>/);
        return;
      }

      const authenticatedSources = resolveAuthenticatedSources(
        contract.routeId,
        contract.moduleFileName,
      );

      assert.match(authenticatedSources.renderer, /renderAuthenticatedShellDocument/);
      assert.match(authenticatedSources.styles, /sharedShellStyles\(\)/);
    });
  }
});
