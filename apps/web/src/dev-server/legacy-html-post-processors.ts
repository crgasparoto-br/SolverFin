export type LegacyHtmlPostProcessorRoute =
  | "/contas-cartoes"
  | "/categorias"
  | "/cartoes"
  | "/lancamentos"
  | "/inbox";

export type LegacyHtmlPostProcessorMigration =
  | "component-props-slots"
  | "view-model-schema"
  | "temporary-processor";

export type LegacyHtmlPostProcessorOwner =
  | "web-accounts-cards"
  | "web-categories"
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

// Issue #610 migrates /cartoes to the A3 master-detail renderer. The four former
// card post-processors remain in the repository only as deprecated reference code
// until a later cleanup can remove the files without losing historical regression context.
export const LEGACY_HTML_POST_PROCESSOR_BUDGET = 5;

export const LEGACY_HTML_POST_PROCESSOR_INVENTORY = [
  {
    id: "accounts-cards-tabs",
    route: "/contas-cartoes",
    order: 1,
    owner: "web-accounts-cards",
    module: "./accounts-cards-enhancement.js",
    exportName: "enhanceAccountsCardsTabs",
    responsibility: "Completa filtros, estilos e runtime das abas de contas/cartoes apos o render.",
    migration: "component-props-slots",
    replacementCriterion:
      "O renderer estrutural entrega filtro ativo, hooks de remuneracao e runtime das abas sem procurar ou substituir HTML final.",
    fallbackAccessibility:
      "Abas, dialogs e filtro continuam operaveis por teclado e mantem labels/aria enquanto o adapter existir.",
  },
  {
    id: "accounts-cards-standardization",
    route: "/contas-cartoes",
    order: 2,
    owner: "web-accounts-cards",
    module: "./accounts-cards-standardization.js",
    exportName: "standardizeAccountsCardsPage",
    responsibility: "Normaliza markup e classes da master de contas/cartoes depois do render.",
    migration: "component-props-slots",
    replacementCriterion:
      "Os componentes da master emitem diretamente a estrutura e as classes canonicas esperadas pelo shell e pelos testes SSR.",
    fallbackAccessibility:
      "A estrutura normalizada preserva ordem de leitura, nomes acessiveis, dialogs e controles existentes.",
  },
  {
    id: "accounts-cards-action-menus",
    route: "/contas-cartoes",
    order: 3,
    owner: "web-accounts-cards",
    module: "./accounts-cards-action-menu-enhancement.js",
    exportName: "enhanceAccountsCardsActionMenus",
    responsibility: "Adiciona menu de acoes, estilos e runtime sobre a estrutura ja renderizada.",
    migration: "component-props-slots",
    replacementCriterion:
      "Um componente de menu de acoes e seu runtime sao renderizados diretamente com estado, foco e itens recebidos por contrato.",
    fallbackAccessibility:
      "Trigger, role=menu/menuitem, retorno de foco e navegacao por teclado permanecem cobertos antes da remocao.",
  },
  {
    id: "categories-icons-tooltips",
    route: "/categorias",
    order: 1,
    owner: "web-categories",
    module: "./categories-icons-enhancement.js",
    exportName: "enhanceCategoriesIconsAndTooltips",
    responsibility: "Decora categorias com icones e tooltips a partir do HTML final.",
    migration: "component-props-slots",
    replacementCriterion:
      "Linhas de categoria recebem icone, label e ajuda como props/slots no renderer, sem localizar trechos HTML por string/regex.",
    fallbackAccessibility:
      "Texto da categoria continua suficiente sem o icone e qualquer ajuda visual mantem nome/descricao acessivel.",
  },
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
