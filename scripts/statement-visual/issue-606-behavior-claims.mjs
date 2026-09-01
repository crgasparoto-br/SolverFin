import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeSemanticProof } from "./semantic-proof.mjs";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const requiredAssertions = parseRequiredAssertions();
const sourceScenario = process.env.STATEMENT_VISUAL_SOURCE_SCENARIO_ID ?? "";
const scenarioId = process.env.STATEMENT_VISUAL_SCENARIO_ID ?? "";
const requestedRoute = process.env.STATEMENT_VISUAL_ROUTE ?? "";
const candidateSha =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local";

if (requiredAssertions.length === 0) {
  throw new Error("Behavior-claim validation requires at least one assertion.");
}

const evidence = await collectEvidence();
const observedAssertions = new Set(evidence.assertions);
for (const assertionName of requiredAssertions) {
  assert.ok(
    observedAssertions.has(assertionName),
    `Behavior claim ${assertionName} was not observed for ${scenarioId}.`,
  );
}

await writeSemanticProof(requiredAssertions, {
  sourceScenario,
  evidenceFiles: evidence.files,
  observations: evidence.observations,
});

function parseRequiredAssertions() {
  const raw = process.env.STATEMENT_VISUAL_REQUIRED_ASSERTIONS;
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("STATEMENT_VISUAL_REQUIRED_ASSERTIONS must be a JSON array of strings.");
  }
  return [...new Set(parsed)].sort();
}

async function collectEvidence() {
  if (sourceScenario === "core-pages") return collectCorePagesEvidence();
  if (sourceScenario === "reports-category-evolution") {
    return collectSemanticEvidence("reports-category-evolution");
  }
  if (sourceScenario === "cards-interface") return collectSemanticEvidence("cards-interface");
  if (sourceScenario === "accounts-cards-interface") return collectAccountsCardsEvidence();
  if (sourceScenario === "settings-interface") return collectSettingsEvidence();
  if (sourceScenario === "account-remuneration") return collectRemunerationEvidence();
  if (sourceScenario === "account-remuneration-mobile") return collectRemunerationEvidence();
  if (sourceScenario === "financial-insights") return collectFinancialInsightsEvidence();
  if (sourceScenario === "sidebar-navigation") return collectSidebarEvidence();
  if (sourceScenario === "inbox-interface-refinement") return collectInboxRefinementEvidence();
  if (sourceScenario === "inbox-interface-accessibility") {
    return collectInboxAccessibilityEvidence();
  }
  if (sourceScenario === "bank-message-ai-inbox") return collectBankMessageEvidence();
  if (sourceScenario === "categories-interface") return collectCategoriesEvidence();
  if (sourceScenario === "cards-interface-adversarial") return collectCardsAdversarialEvidence();
  if (sourceScenario === "financial-assistant") return collectFinancialAssistantEvidence();
  if (sourceScenario === "budgets-pilot-baseline") return collectBudgetsEvidence();
  if (sourceScenario === "statement-profile-keyboard") {
    return collectStatementProfileKeyboardEvidence();
  }
  if (sourceScenario === "dashboard-empty-state") {
    return collectEmptyEvidence("issue-606-dashboard-empty.json");
  }
  if (sourceScenario === "accounts-cards-empty-state") {
    return collectEmptyEvidence("issue-606-accounts-cards-empty.json");
  }
  if (sourceScenario === "budgets-empty-state") {
    return collectEmptyEvidence("issue-606-budgets-empty.json");
  }
  throw new Error(`No behavior evidence adapter is registered for ${sourceScenario}.`);
}

async function collectCorePagesEvidence() {
  if (requestedRoute === "/lancamentos") return collectSemanticEvidence("core-pages");
  const fileByRoute = {
    "/dashboard": "issue-606-core-dashboard.json",
    "/cartoes": "issue-606-core-cartoes.json",
    "/contas": "issue-606-core-contas.json",
  };
  const fileName = fileByRoute[requestedRoute];
  if (!fileName) throw new Error(`No core-page evidence file for ${requestedRoute}.`);
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  const widths = new Set((report.pages ?? []).map((page) => page.width));
  assert.ok(widths.has(390), `${fileName} has no mobile execution.`);
  assert.ok(
    [...widths].some((width) => width >= 1024),
    `${fileName} has no desktop execution.`,
  );
  assert.ok(
    (report.pages ?? []).every((page) => page.measurements?.globalOverflow === false),
    `${fileName} contains a viewport with global overflow.`,
  );
  const assertions = ["behavior:layout:desktop", "behavior:layout:mobile"];
  if (requestedRoute === "/dashboard") {
    assertions.unshift("behavior:component:PageHeader");
    assertions.unshift("behavior:component:PageContainer");
  }
  return {
    files: [fileName],
    assertions,
    observations: { widths: [...widths].sort((left, right) => left - right) },
  };
}

async function collectSemanticEvidence(name) {
  const fileName = `issue-606-semantic-${name}.json`;
  const report = await readEvidence(fileName);
  assert.equal(report.sourceScenario, name, `${fileName} source scenario mismatch.`);
  assert.ok(Array.isArray(report.assertions), `${fileName} has no behavior assertions.`);
  return {
    files: [fileName],
    assertions: report.assertions,
    observations: report.observations ?? {},
  };
}

async function collectAccountsCardsEvidence() {
  const fileName = "issue-535-accounts-cards.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  const scenarios = report.scenarios ?? [];
  const pages = scenarios.filter((scenario) => scenario.kind === "page");
  const widths = new Set(
    pages
      .map((scenario) => Number.parseInt(String(scenario.viewport).split("x")[0], 10))
      .filter(Number.isFinite),
  );
  assert.ok(widths.has(390), "Accounts/Cards evidence has no mobile page.");
  assert.ok(
    [...widths].some((width) => width >= 1366),
    "Accounts/Cards evidence has no desktop page.",
  );
  assert.ok(
    pages.some(
      (scenario) => scenario.expectedTab === "accounts" && scenario.measurements?.itemCount > 0,
    ),
    "Accounts/Cards evidence has no populated accounts detail flow.",
  );
  assert.ok(
    pages.some(
      (scenario) => scenario.expectedTab === "cards" && scenario.measurements?.cardRowCount > 0,
    ),
    "Accounts/Cards evidence has no populated cards detail flow.",
  );
  assert.ok(
    scenarios.some(
      (scenario) => scenario.kind === "instrument-modal" && scenario.measurements?.open,
    ),
    "Accounts/Cards evidence has no opened instrument dialog.",
  );
  assert.ok(
    scenarios.some((scenario) => scenario.kind === "row-action-menu" && scenario.opened?.opened),
    "Accounts/Cards evidence has no row action menu proof.",
  );
  return {
    files: [fileName],
    assertions: [
      "behavior:component:DetailLayout",
      "behavior:component:Dialog",
      "behavior:component:Tabs",
      "behavior:legacy:accounts-cards-tabs",
      "behavior:legacy:accounts-cards-standardization",
      "behavior:legacy:accounts-cards-action-menus",
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ],
    observations: { widths: [...widths].sort((left, right) => left - right) },
  };
}

async function collectSettingsEvidence() {
  const fileName = "settings-interface.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  assert.equal(report.profilesDesktop?.dialogKeyboard?.openedWithEnter, true);
  assert.equal(report.profilesDesktop?.dialogKeyboard?.closedWithEscape, true);
  assert.equal(report.profilesMobile?.measurements?.noHorizontalOverflow, true);
  assert.ok(report.rulesDesktop?.measurements?.ruleItemCount >= 2);
  assert.equal(report.rulesMobile?.measurements?.noHorizontalOverflow, true);
  return {
    files: [fileName],
    assertions: [
      "behavior:component:FormLayout",
      "behavior:component:Dialog",
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ],
    observations: {
      desktop: report.rulesDesktop?.measurements,
      mobile: report.rulesMobile?.measurements,
    },
  };
}

async function collectRemunerationEvidence() {
  const fileName = "issue-490-account-remuneration.json";
  const report = await readEvidence(fileName);
  assert.equal(report.stage, "completed", `${fileName} did not complete.`);
  assert.equal(report.firstExpanded?.first?.detailsOpen, true);
  assert.equal(report.mobileExpanded?.first?.detailsOpen, true);
  assert.equal(report.mobileExpanded?.globalOverflow, false);
  const core = await collectSemanticEvidence("core-pages");
  assert.ok(
    core.assertions.includes("behavior:legacy:statement-list-sorting"),
    "Core semantic evidence lost statement sorting proof.",
  );
  return {
    files: [fileName, ...core.files],
    assertions: [
      "behavior:legacy:statement-list-sorting",
      "behavior:legacy:account-remuneration-disclosure",
    ],
    observations: {
      desktopExpanded: report.firstExpanded?.first?.detailsOpen,
      mobileExpanded: report.mobileExpanded?.first?.detailsOpen,
      statementSorting: core.observations?.sorting,
    },
  };
}

async function collectFinancialInsightsEvidence() {
  const fileName = "issue-567-financial-insights.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  assert.equal(report.navigation?.pathname, "/lancamentos");
  assert.ok(report.navigation?.month, "Financial insight navigation lost its month context.");
  const core = await collectSemanticEvidence("core-pages");
  assert.ok(
    core.assertions.includes("behavior:legacy:statement-insight-context"),
    "Core semantic evidence lost statement insight-context proof.",
  );
  return {
    files: [fileName, ...core.files],
    assertions: ["behavior:legacy:statement-insight-context"],
    observations: {
      navigation: report.navigation,
      insightContext: core.observations?.insight,
    },
  };
}

async function collectSidebarEvidence() {
  const fileName = "issue-480-sidebar.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  assert.equal(report.desktop?.measurements?.navigation?.focusedTarget, true);
  assert.equal(report.desktop?.measurements?.navigation?.isScrollable, true);
  assert.equal(report.mobile?.opened?.ariaExpanded, "true");
  assert.equal(report.mobile?.closed?.ariaExpanded, "false");
  return {
    files: [fileName],
    assertions: ["behavior:component:Drawer", "behavior:layout:desktop", "behavior:layout:mobile"],
    observations: {
      desktopViewport: report.desktop?.viewport,
      mobileViewport: report.mobile?.viewport,
    },
  };
}

async function collectInboxRefinementEvidence() {
  const fileName = "issue-525-inbox-interface-refinement.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  assert.ok(report.desktop?.completeRows >= 5);
  assert.equal(report.desktop?.bodyFitsViewport, true);
  assert.equal(report.mobile?.bodyFitsViewport, true);
  assert.equal(report.mobile?.actionsFitViewport, true);
  return {
    files: [fileName],
    assertions: [
      "behavior:legacy:inbox-list-layout",
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ],
    observations: {
      desktopRows: report.desktop?.completeRows,
      mobileRows: report.mobile?.completeRows,
    },
  };
}

async function collectInboxAccessibilityEvidence() {
  const fileName = "issue-525-inbox-accessibility.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  assert.ok(report.desktop?.completeRows >= 1);
  assert.equal(report.desktop?.bodyFitsViewport, true);
  assert.equal(report.mobile?.bodyFitsViewport, true);
  assert.equal(report.mobile?.actionsFitViewport, true);
  return {
    files: [fileName],
    assertions: ["behavior:legacy:inbox-list-layout"],
    observations: {
      desktopRows: report.desktop?.completeRows,
      mobileActionsFit: report.mobile?.actionsFitViewport,
    },
  };
}

async function collectBankMessageEvidence() {
  const fileName = "issue-563-bank-message-ai-inbox.json";
  const report = await readEvidence(fileName);
  assert.equal(report.stage, "passed", `${fileName} did not pass.`);
  assert.equal(report.desktop?.bodyFitsViewport, true);
  assert.equal(report.mobile?.bodyFitsViewport, true);
  assert.equal(report.desktop?.deterministicVisible, true);
  assert.equal(report.desktop?.aiReadyVisible, true);
  return {
    files: [fileName],
    assertions: ["behavior:legacy:inbox-structured-payload"],
    observations: { desktop: report.desktop, mobile: report.mobile },
  };
}

async function collectCategoriesEvidence() {
  const fileName = "categories-interface.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  assert.equal(report.desktop?.measurements?.filterCount, 5);
  assert.equal(report.mobile?.measurements?.filterCount, 5);
  assert.equal(report.desktopModal?.measurements?.visible, true);
  assert.equal(report.mobileModal?.measurements?.visible, true);
  return {
    files: [fileName],
    assertions: [
      "behavior:legacy:categories-icons-tooltips",
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ],
    observations: {
      desktop: report.desktop?.measurements,
      mobile: report.mobile?.measurements,
    },
  };
}

async function collectCardsAdversarialEvidence() {
  const fileName = "cards-interface-adversarial.json";
  const report = await readEvidence(fileName);
  assert.equal(report.compactDesktop?.noHorizontalOverflow, true);
  assert.equal(report.keyboardModal?.opened?.visible, true);
  assert.equal(report.keyboardModal?.closed?.focusRestored, true);
  assert.ok(report.liveRegion?.initial?.rowCount > 0);
  return {
    files: [fileName],
    assertions: ["behavior:legacy:cards-interface", "behavior:legacy:cards-interface-finalizer"],
    observations: {
      rows: report.liveRegion?.initial?.rowCount,
      compactDesktop: report.compactDesktop,
    },
  };
}

async function collectFinancialAssistantEvidence() {
  const fileName = "issue-568-financial-assistant.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  const widths = new Set((report.captures ?? []).map((capture) => capture.viewport?.width));
  assert.ok(widths.has(390), `${fileName} has no mobile capture.`);
  assert.ok(
    [...widths].some((width) => width >= 1024),
    `${fileName} has no desktop capture.`,
  );
  return {
    files: [fileName],
    assertions: ["behavior:layout:desktop", "behavior:layout:mobile"],
    observations: { widths: [...widths].sort((left, right) => left - right) },
  };
}

async function collectBudgetsEvidence() {
  const fileName = "issue-606-budgets-pilot.json";
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  const widths = new Set(
    (report.scenarios ?? []).map((scenario) => scenario.measurements?.viewportWidth),
  );
  assert.ok(widths.has(390), `${fileName} has no mobile scenario.`);
  assert.ok(
    [...widths].some((width) => width >= 1024),
    `${fileName} has no desktop scenario.`,
  );
  return {
    files: [fileName],
    assertions: ["behavior:layout:desktop", "behavior:layout:mobile"],
    observations: { widths: [...widths].sort((left, right) => left - right) },
  };
}

async function collectStatementProfileKeyboardEvidence() {
  const fileName = "issue-609-profile-keyboard.json";
  const report = await readEvidence(fileName);
  const scenarios = report.scenarios ?? [];
  const widths = new Set(
    scenarios
      .map((scenario) => Number.parseInt(String(scenario.viewport).split("x")[0], 10))
      .filter(Number.isFinite),
  );
  assert.ok(widths.has(390), `${fileName} has no mobile scenario.`);
  assert.ok(
    [...widths].some((width) => width >= 1024),
    `${fileName} has no desktop scenario.`,
  );
  assert.ok(
    scenarios.every((scenario) => scenario.profile?.visible === true),
    `${fileName} contains a scenario without visible profile context.`,
  );
  assert.ok(
    scenarios.every(
      (scenario) =>
        scenario.focusedOption?.role === "option" && scenario.focusedOption?.menuOpen === true,
    ),
    `${fileName} contains a scenario without keyboard focus in the account listbox.`,
  );
  assert.ok(
    scenarios.every(
      (scenario) =>
        scenario.selectedState?.accountId &&
        scenario.selectedState.accountId === scenario.selectedState.selectedId,
    ),
    `${fileName} contains a scenario where keyboard selection did not update the account.`,
  );
  return {
    files: [fileName],
    assertions: ["behavior:layout:desktop", "behavior:layout:mobile"],
    observations: {
      widths: [...widths].sort((left, right) => left - right),
      profileVisible: scenarios.every((scenario) => scenario.profile?.visible === true),
      keyboardSelection: scenarios.every(
        (scenario) => scenario.selectedState?.accountId === scenario.selectedState?.selectedId,
      ),
    },
  };
}

async function collectEmptyEvidence(fileName) {
  const report = await readEvidence(fileName);
  assertNoFailures(report, fileName);
  const widths = new Set((report.viewports ?? []).map((viewport) => viewport.width));
  assert.ok(widths.has(390), `${fileName} has no mobile empty-state evidence.`);
  assert.ok(
    [...widths].some((width) => width >= 1024),
    `${fileName} has no desktop empty-state evidence.`,
  );
  return {
    files: [fileName],
    assertions: ["behavior:layout:desktop", "behavior:layout:mobile"],
    observations: { widths: [...widths].sort((left, right) => left - right) },
  };
}

async function readEvidence(fileName) {
  const report = JSON.parse(await readFile(join(outputDir, fileName), "utf8"));
  assert.equal(report.commit, candidateSha, `${fileName} is stale for ${candidateSha}.`);
  return report;
}

function assertNoFailures(report, fileName) {
  const failures = report.failures ?? [];
  assert.equal(failures.length, 0, `${fileName} contains ${failures.length} failure(s).`);
}
