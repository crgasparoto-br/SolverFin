import { createHash } from "node:crypto";

export const VISUAL_GATE_CONTRACT_VERSION = 1;
export const VISUAL_FINGERPRINT_VERSION = 1;

export const criticalStructuralComponents = [
  "PageContainer",
  "PageHeader",
  "FilterBar",
  "SummaryGrid",
  "DataTable",
  "DetailLayout",
  "FormLayout",
  "EmptyState",
  "Loading",
  "RecoverableError",
  "UnavailableState",
  "PermissionState",
  "Dialog",
  "Drawer",
  "Tabs",
  "Badge",
  "Alert",
  "Toast",
];

export const criticalStructuralRealFlowComponents = [
  "PageContainer",
  "PageHeader",
  "FilterBar",
  "SummaryGrid",
  "DataTable",
  "DetailLayout",
  "FormLayout",
  "Dialog",
  "Drawer",
  "Tabs",
];

export const criticalStructuralRealFlowCoverage = {
  PageContainer: ["core-pages"],
  PageHeader: ["core-pages"],
  FilterBar: ["reports-category-evolution"],
  SummaryGrid: ["cards-interface"],
  DataTable: ["core-pages", "reports-category-evolution"],
  DetailLayout: ["accounts-cards-interface"],
  FormLayout: ["settings-interface"],
  Dialog: ["accounts-cards-interface", "settings-interface"],
  Drawer: ["sidebar-navigation"],
  Tabs: ["cards-interface"],
};

export const pilotRoutes = [
  { route: "/dashboard", archetype: "A1", migrationIssue: 608, adoption: "foundation" },
  { route: "/lancamentos", archetype: "A2", migrationIssue: 609, adoption: "foundation" },
  { route: "/cartoes", archetype: "A3", migrationIssue: 610, adoption: "foundation" },
  { route: "/relatorios", archetype: "A5", migrationIssue: 611, adoption: "foundation" },
  { route: "/contas-cartoes", archetype: "A3", migrationIssue: 612, adoption: "foundation" },
  { route: "/orcamentos", archetype: "A1", migrationIssue: 613, adoption: "foundation" },
  { route: "/inbox", archetype: "A6", migrationIssue: 614, adoption: "foundation" },
];

export const legacyProcessorBaselineIds = [
  "accounts-cards-tabs",
  "accounts-cards-standardization",
  "accounts-cards-action-menus",
  "categories-icons-tooltips",
  "card-list-sorting",
  "card-instrument-subtotals",
  "cards-interface",
  "cards-interface-finalizer",
  "statement-list-sorting",
  "account-remuneration-disclosure",
  "statement-insight-context",
  "inbox-structured-payload",
  "inbox-list-layout",
];

export const legacyProcessorRetirementCoverage = {
  "accounts-cards-tabs": ["accounts-cards-interface"],
  "accounts-cards-standardization": ["accounts-cards-interface"],
  "accounts-cards-action-menus": ["accounts-cards-interface"],
  "categories-icons-tooltips": ["categories-interface"],
  "card-list-sorting": ["cards-interface"],
  "card-instrument-subtotals": ["cards-interface"],
  "cards-interface": ["cards-interface", "cards-interface-adversarial"],
  "cards-interface-finalizer": ["cards-interface", "cards-interface-adversarial"],
  "statement-list-sorting": ["core-pages", "account-remuneration"],
  "account-remuneration-disclosure": ["account-remuneration", "account-remuneration-mobile"],
  "statement-insight-context": ["core-pages", "financial-insights"],
  "inbox-structured-payload": ["bank-message-ai-inbox"],
  "inbox-list-layout": ["inbox-interface-refinement", "inbox-interface-accessibility"],
};

function coverage({
  route,
  archetype = "support",
  audience = "authenticated",
  state,
  layout,
  interaction,
  dataProfile,
  components = [],
  realBrowser = true,
  archetypeSupport = [],
}) {
  return {
    route,
    archetype,
    audience,
    state,
    layout,
    interaction,
    dataProfile,
    components,
    realBrowser,
    archetypeSupport,
  };
}

function simpleScenario(id, module, route, archetype, state, layout, interaction, dataProfile) {
  return {
    id,
    module,
    coverage: [coverage({ route, archetype, state, layout, interaction, dataProfile })],
  };
}

const keyScenarios = [
  {
    id: "core-pages",
    module: "scripts/statement-visual/main.mjs",
    coverage: [
      coverage({
        route: "/lancamentos",
        archetype: "A2",
        state: "normal",
        layout: "desktop-mobile",
        interaction: "overflow-and-focus",
        dataProfile: "long-statement",
      }),
      coverage({
        route: "/dashboard",
        archetype: "A1",
        state: "normal",
        layout: "desktop-mobile",
        interaction: "viewport-smoke",
        dataProfile: "demo-seed",
      }),
      coverage({
        route: "/cartoes",
        archetype: "A3",
        state: "normal",
        layout: "desktop-mobile",
        interaction: "viewport-smoke",
        dataProfile: "demo-seed",
      }),
      coverage({
        route: "/contas",
        archetype: "support",
        state: "normal",
        layout: "desktop-mobile",
        interaction: "viewport-smoke",
        dataProfile: "demo-seed",
      }),
    ],
  },
  {
    id: "reports-category-evolution",
    module: "scripts/statement-visual/reports-category-evolution.mjs",
    coverage: [
      coverage({
        route: "/relatorios",
        archetype: "A5",
        state: "normal",
        layout: "desktop-mobile",
        interaction: "keyboard-focus-overflow",
        dataProfile: "category-evolution",
      }),
      coverage({
        route: "/relatorios",
        archetype: "A5",
        state: "empty",
        layout: "desktop",
        interaction: "state-render",
        dataProfile: "future-period",
      }),
      coverage({
        route: "/relatorios",
        archetype: "A5",
        state: "error",
        layout: "desktop",
        interaction: "filter-error",
        dataProfile: "invalid-filter",
      }),
    ],
  },
  {
    id: "ui-primitives",
    module: "scripts/statement-visual/issue-601-ui-primitives.mjs",
    coverage: [
      coverage({
        route: "component://ui-primitives",
        archetype: "foundation",
        state: "long-content",
        layout: "desktop-mobile",
        interaction: "keyboard-focus-dialog-overflow",
        dataProfile: "primitive-fixture",
        components: [
          "PageContainer",
          "PageHeader",
          "DataTable",
          "DetailLayout",
          "Dialog",
          "Drawer",
        ],
      }),
    ],
  },
  {
    id: "foundation-states",
    module: "scripts/statement-visual/issue-606-foundation-states.mjs",
    coverage: [
      coverage({
        route: "component://foundation-states",
        archetype: "foundation",
        state: "alternate",
        layout: "desktop-mobile",
        interaction: "keyboard-focus-state-render",
        dataProfile: "all-foundation-states",
        components: [
          "FilterBar",
          "SummaryGrid",
          "FormLayout",
          "EmptyState",
          "Loading",
          "RecoverableError",
          "UnavailableState",
          "PermissionState",
          "Tabs",
          "Badge",
          "Alert",
          "Toast",
        ],
        archetypeSupport: ["A1", "A2", "A3", "A4", "A5", "A6"],
      }),
    ],
  },
  {
    id: "cards-interface",
    module: "scripts/statement-visual/cards-interface.mjs",
    coverage: [
      coverage({
        route: "/cartoes",
        archetype: "A3",
        state: "normal",
        layout: "desktop-mobile",
        interaction: "filters-modal",
        dataProfile: "invoice-purchases",
      }),
      coverage({
        route: "/cartoes",
        archetype: "A3",
        state: "empty",
        layout: "desktop",
        interaction: "filtered-empty",
        dataProfile: "no-search-results",
      }),
    ],
  },
];

// prettier-ignore
const simpleScenarios = [
  ["transaction-group-layout", "scripts/statement-visual/transaction-group-layout.mjs", "/lancamentos", "A2", "grouped", "responsive", "group-layout", "transaction-group"],
  ["transaction-group-modal", "scripts/statement-visual/transaction-group-modal.mjs", "/lancamentos", "A2", "normal", "modal", "dialog", "transaction-group-modal"],
  ["transaction-group-pending-fixes", "scripts/statement-visual/transaction-group-pending-fixes.mjs", "/lancamentos", "A2", "pending", "responsive", "group-actions", "pending-fixes"],
  ["transaction-bulk-selection", "scripts/statement-visual/transaction-bulk-selection.mjs", "/lancamentos", "A2", "selected", "desktop", "bulk-selection", "multiple-transactions"],
  ["transaction-bulk-selection-keyboard", "scripts/statement-visual/transaction-bulk-selection-keyboard.mjs", "/lancamentos", "A2", "selected", "desktop", "keyboard-focus", "bulk-selection"],
  ["transaction-bulk-selection-clearance", "scripts/statement-visual/transaction-bulk-selection-clearance.mjs", "/lancamentos", "A2", "cleared", "desktop", "bulk-selection", "clear-selection"],
  ["inbox-category-hierarchy", "scripts/statement-visual/inbox-category-hierarchy.mjs", "/inbox", "A6", "normal", "responsive", "category-hierarchy", "categorized-inbox"],
  ["inbox-ofx-review", "scripts/statement-visual/issue-548-inbox-ofx-review.mjs", "/inbox", "A6", "review", "responsive", "review-flow", "ofx-review"],
  ["inbox-status-control", "scripts/statement-visual/inbox-status-control.mjs", "/inbox", "A6", "status-change", "responsive", "status-control", "review-status"],
  ["inbox-date-filter", "scripts/statement-visual/inbox-date-filter.mjs", "/inbox", "A6", "filtered", "responsive", "filter", "date-filter"],
  ["accounts-cards-interface", "scripts/statement-visual/accounts-cards-interface.mjs", "/contas-cartoes", "A3", "normal", "desktop-mobile", "keyboard-focus-modal", "accounts-and-cards"],
  ["hover-states", "scripts/statement-visual/issue-537-hover-states.mjs", "/lancamentos", "A2", "interactive", "desktop", "hover-focus", "hover-states"],
  ["operational-installments", "scripts/statement-visual/issue-539-operational-installments-v2.mjs", "/lancamentos", "A2", "installments", "responsive", "installment-flow", "installments"],
  ["operational-installments-keyboard", "scripts/statement-visual/issue-539-operational-installments-keyboard.mjs", "/lancamentos", "A2", "installments", "desktop", "keyboard-focus", "installments"],
  ["installment-grouping-guard", "scripts/statement-visual/issue-539-installment-grouping-guard.mjs", "/lancamentos", "A2", "grouped", "responsive", "grouping-guard", "installment-grouping"],
  ["manual-installments", "scripts/statement-visual/issue-553-manual-installments-v2.mjs", "/lancamentos", "A2", "editing", "dialog", "submit-retry", "manual-installments"],
  ["transfer-destination-visibility", "scripts/statement-visual/issue-553-transfer-destination-visibility.mjs", "/lancamentos", "A2", "transfer", "responsive", "cross-account-visibility", "transfer-installment"],
  ["ambiguous-recovery", "scripts/statement-visual/issue-553-ambiguous-recovery.mjs", "/lancamentos", "A2", "recoverable-error", "dialog", "recovery", "masked-timeout"],
  ["ambiguous-close", "scripts/statement-visual/issue-553-ambiguous-close.mjs", "/lancamentos", "A2", "recoverable-error", "dialog", "keyboard-focus", "recovery-close"],
  ["non-idempotent-ambiguity", "scripts/statement-visual/issue-553-non-idempotent-ambiguity.mjs", "/lancamentos", "A2", "ambiguous", "dialog", "no-blind-retry", "non-idempotent"],
  ["reports-category-controls", "scripts/statement-visual/issue-546-reports-category-controls.mjs", "/relatorios", "A5", "filtered", "responsive", "filters", "category-controls"],
  ["reports-selected-view-navigation", "scripts/statement-visual/issue-546-selected-view-navigation.mjs", "/relatorios", "A5", "normal", "responsive", "navigation", "selected-view"],
  ["reports-installments-regression", "scripts/statement-visual/reports-installments-regression.mjs", "/relatorios", "A5", "normal", "responsive", "regression", "installments"],
  ["settings-interface", "scripts/statement-visual/settings-interface.mjs", "/configuracoes", "A4", "normal", "desktop-mobile", "form-flow", "settings"],
  ["settings-interface-reservations", "scripts/statement-visual/settings-interface-reservations.mjs", "/configuracoes", "A4", "reserved", "responsive", "form-flow", "reserved-fields"],
  ["category-learning", "scripts/statement-visual/issue-564-category-learning.mjs", "/inbox", "A6", "learning", "responsive", "review-flow", "category-learning"],
  ["ai-review-queue", "scripts/statement-visual/issue-565-ai-review-queue.mjs", "/inbox", "A6", "review", "responsive", "review-flow", "ai-review"],
  ["ai-review-queue-states", "scripts/statement-visual/issue-565-ai-review-queue-states.mjs", "/inbox", "A6", "alternate", "responsive", "state-render", "ai-review-states"],
  ["financial-insights", "scripts/statement-visual/issue-567-financial-insights.mjs", "/lancamentos", "A2", "insights", "responsive", "drilldown", "financial-insights"],
  ["financial-assistant", "scripts/statement-visual/issue-568-financial-assistant.mjs", "/assistente", "support", "normal", "desktop-mobile", "keyboard-focus", "assistant"],
  ["financial-assistant-cancel", "scripts/statement-visual/issue-568-financial-assistant-cancel-inflight.mjs", "/assistente", "support", "processing", "responsive", "cancel", "assistant-inflight"],
  ["financial-assistant-zoom", "scripts/statement-visual/issue-568-financial-assistant-zoom-200-reflow.mjs", "/assistente", "support", "normal", "zoom-200-reflow", "reflow-overflow", "assistant-long-content"],
  ["budgets-pilot-baseline", "scripts/statement-visual/issue-606-budgets-pilot.mjs", "/orcamentos", "A1", "normal", "desktop-mobile", "viewport-smoke", "demo-seed"],
  ["productive-auth-login", "scripts/statement-visual/productive-auth-login.mjs", "/login", "support", "normal", "responsive", "authentication", "productive-auth"],
  ["account-remuneration", "scripts/statement-visual/account-remuneration.mjs", "/lancamentos", "A2", "remuneration", "desktop", "disclosure", "remunerated-account"],
  ["account-remuneration-mobile", "scripts/statement-visual/account-remuneration-mobile-evidence.mjs", "/lancamentos", "A2", "remuneration", "mobile", "disclosure", "remunerated-account"],
  ["account-edit", "scripts/statement-visual/account-edit.mjs", "/contas-cartoes", "A3", "editing", "responsive", "form-modal", "account-edit"],
  ["sidebar-navigation", "scripts/statement-visual/sidebar-navigation.mjs", "shell://authenticated", "support", "normal", "desktop-mobile", "keyboard-navigation", "navigation"],
  ["inbox-csv-review", "scripts/statement-visual/inbox-csv-review.mjs", "/inbox", "A6", "review", "responsive", "review-flow", "csv-review"],
  ["inbox-interface-refinement", "scripts/statement-visual/inbox-interface-refinement.mjs", "/inbox", "A6", "normal", "desktop-mobile", "keyboard-focus-overflow", "large-import-batch"],
  ["inbox-interface-accessibility", "scripts/statement-visual/inbox-interface-accessibility.mjs", "/inbox", "A6", "normal", "responsive", "keyboard-focus-accessibility", "review-batch"],
  ["bank-message-ai-inbox", "scripts/statement-visual/bank-message-ai-inbox.mjs", "/inbox", "A6", "review", "responsive", "review-flow", "bank-message"],
  ["inbox-content-contrast", "scripts/statement-visual/inbox-interface-content-contrast.mjs", "/inbox", "A6", "normal", "responsive", "content-contrast", "review-content"],
  ["categories-interface", "scripts/statement-visual/categories-interface.mjs", "/categorias", "A4", "normal", "desktop-mobile", "keyboard-tooltips", "categories"],
  ["cards-interface-adversarial", "scripts/statement-visual/cards-interface-adversarial.mjs", "/cartoes", "A3", "long-content", "desktop-1366x768", "keyboard-focus-overflow", "long-purchase-content"],
].map((args) => simpleScenario(...args));

export const visualScenarioModules = [...keyScenarios, ...simpleScenarios];

export function createCoverageFingerprint(record) {
  const identity = {
    version: VISUAL_FINGERPRINT_VERSION,
    route: record.route,
    audience: record.audience,
    state: record.state,
    layout: record.layout,
    interaction: record.interaction,
    dataProfile: record.dataProfile,
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function flattenCoverageRecords(scenarios = visualScenarioModules) {
  return scenarios.flatMap((scenario) =>
    scenario.coverage.map((record) => ({
      ...record,
      scenarioId: scenario.id,
      module: scenario.module,
      fingerprint: createCoverageFingerprint(record),
    })),
  );
}
