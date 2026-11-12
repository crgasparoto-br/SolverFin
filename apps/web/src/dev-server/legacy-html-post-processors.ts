export type LegacyHtmlPostProcessorRoute =
  | "/contas-cartoes"
  | "/cartoes"
  | "/lancamentos"
  | "/inbox";

export type LegacyHtmlPostProcessorMigration =
  | "component-props-slots"
  | "view-model-schema"
  | "temporary-processor";

export type LegacyHtmlPostProcessorOwner =
  | "web-accounts-cards"
  | "web-cards"
  | "web-statement"
  | "web-inbox";

export interface LegacyHtmlPostProcessorInventoryEntry {
  id: string;
  route: LegacyHtmlPostProcessorRoute;
  order: number;
  owner: LegacyHtmlPostProcessorOwner;
  module: string;
  exportName: string;
  responsibility: string;
  migration: LegacyHtmlPostProcessorMigration;
  replacementCriterion: string;
  fallbackAccessibility: string;
}

// Issues #610, #612 and #615 migrate /cartoes, /contas-cartoes and /categorias to direct structural renderers.
// Their former post-processors remain in the repository only as deprecated reference code.
export const LEGACY_HTML_POST_PROCESSOR_BUDGET = 1;

export const LEGACY_HTML_POST_PROCESSOR_INVENTORY = [
  {
    id: "account-remuneration-disclosure",
    route: "/lancamentos",
    order: 1,
    owner: "web-statement",
    module: "./account-remuneration-disclosure-enhancement.js",
    exportName: "enhanceAccountRemunerationDisclosure",
    responsibility:
      "Adapter temporario que preserva selecao em massa, operacoes de agrupamento e affordance de remuneracao enquanto esses runtimes sao extraidos do legado.",
    migration: "temporary-processor",
    replacementCriterion:
      "Selecao em massa, edicao de agrupamentos e disclosure de remuneracao sao emitidos diretamente pelo renderer A2 com contratos de runtime equivalentes, sem transformar HTML final.",
    fallbackAccessibility:
      "Selecao, dialogs, memoria de calculo, foco, teclado e labels permanecem operaveis durante a ultima etapa da migracao.",
  },
] as const satisfies readonly LegacyHtmlPostProcessorInventoryEntry[];

export type LegacyHtmlPostProcessorId = (typeof LEGACY_HTML_POST_PROCESSOR_INVENTORY)[number]["id"];

export interface LegacyHtmlPostProcessorStep {
  id: LegacyHtmlPostProcessorId;
  transform: (html: string) => string | Promise<string>;
}

export async function applyLegacyHtmlPostProcessorPipeline(
  route: LegacyHtmlPostProcessorRoute,
  html: string,
  steps: readonly LegacyHtmlPostProcessorStep[],
): Promise<string> {
  const expectedIds = LEGACY_HTML_POST_PROCESSOR_INVENTORY.filter((entry) => entry.route === route)
    .map((entry) => entry)
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.id);
  const receivedIds = steps.map((step) => step.id);

  if (
    expectedIds.length !== receivedIds.length ||
    expectedIds.some((id, index) => id !== receivedIds[index])
  ) {
    throw new Error(
      `Legacy HTML post-processor order mismatch for ${route}. Expected [${expectedIds.join(", ")}], received [${receivedIds.join(", ")}].`,
    );
  }

  let currentHtml = html;
  for (const step of steps) currentHtml = await step.transform(currentHtml);
  return currentHtml;
}
