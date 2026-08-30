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

export const LEGACY_HTML_POST_PROCESSOR_BUDGET = 11;

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
    id: "card-list-sorting",
    route: "/cartoes",
    order: 1,
    owner: "web-cards",
    module: "./list-sorting-enhancement.js",
    exportName: "enhanceCardListSorting",
    responsibility: "Reordena visualmente a lista de cartoes depois da geracao do documento.",
    migration: "view-model-schema",
    replacementCriterion:
      "A ordenacao e resolvida no ViewModel antes do render e o HTML ja nasce na ordem final para o periodo selecionado.",
    fallbackAccessibility:
      "A ordem visual e a ordem do DOM permanecem equivalentes para leitura e navegacao por teclado.",
  },
  {
    id: "card-instrument-subtotals",
    route: "/cartoes",
    order: 2,
    owner: "web-cards",
    module: "./card-instrument-subtotals-enhancement.js",
    exportName: "enhanceCardInstrumentSubtotals",
    responsibility: "Calcula/insere subtotais de instrumentos sobre grupos ja renderizados.",
    migration: "view-model-schema",
    replacementCriterion:
      "Subtotais e agrupamentos fazem parte do ViewModel da fatura/cartao e sao renderizados junto ao grupo correspondente.",
    fallbackAccessibility:
      "Subtotais preservam contexto textual de grupo e nao dependem apenas de posicao, cor ou estilo visual.",
  },
  {
    id: "cards-interface",
    route: "/cartoes",
    order: 3,
    owner: "web-cards",
    module: "./cards-interface-enhancement.js",
    exportName: "enhanceCardsInterface",
    responsibility:
      "Complementa estrutura, estilos e runtime da interface de cartoes apos o render.",
    migration: "component-props-slots",
    replacementCriterion:
      "Componentes de cartao/fatura emitem diretamente estados, acoes e hooks de runtime usados pela interface final.",
    fallbackAccessibility:
      "Controles, dialogs, estados vazios e feedback mantem nomes acessiveis e operacao por teclado.",
  },
  {
    id: "cards-interface-finalizer",
    route: "/cartoes",
    order: 4,
    owner: "web-cards",
    module: "./cards-interface-finalizer.js",
    exportName: "finalizeCardsInterface",
    responsibility: "Faz ajustes finais dependentes do markup concreto da tela de cartoes.",
    migration: "component-props-slots",
    replacementCriterion:
      "O renderer estrutural satisfaz o contrato final da tela sem uma etapa posterior de finalizacao textual.",
    fallbackAccessibility:
      "A retirada so ocorre quando o HTML servido conserva semantica, foco, labels e estados equivalentes.",
  },
  {
    id: "statement-list-sorting",
    route: "/lancamentos",
    order: 1,
    owner: "web-statement",
    module: "./list-sorting-enhancement.js",
    exportName: "enhanceStatementListSorting",
    responsibility: "Reordena linhas do extrato e injeta apresentacao associada depois do render.",
    migration: "view-model-schema",
    replacementCriterion:
      "O ViewModel do extrato determina ordem e metadados de apresentacao antes de renderizar as linhas.",
    fallbackAccessibility:
      "A ordem do DOM continua refletindo a ordem apresentada e estados de linha permanecem anunciaveis.",
  },
  {
    id: "account-remuneration-disclosure",
    route: "/lancamentos",
    order: 2,
    owner: "web-statement",
    module: "./account-remuneration-disclosure-enhancement.js",
    exportName: "enhanceAccountRemunerationDisclosure",
    responsibility:
      "Adiciona affordance e memoria de calculo de remuneracao sobre linhas ja renderizadas.",
    migration: "view-model-schema",
    replacementCriterion:
      "Dados de remuneracao e disclosure chegam no ViewModel da linha e o componente renderiza a affordance diretamente.",
    fallbackAccessibility:
      "Memoria de calculo e acao de disclosure continuam acessiveis por texto, foco e teclado durante a transicao.",
  },
  {
    id: "statement-insight-context",
    route: "/lancamentos",
    order: 3,
    owner: "web-statement",
    module: "./statement-insight-context-enhancement.js",
    exportName: "enhanceStatementInsightContext",
    responsibility: "Acopla contexto de insights ao extrato com base no documento final e na URL.",
    migration: "view-model-schema",
    replacementCriterion:
      "O contexto de insight e calculado antes do render e entregue como dado estruturado ao componente responsavel.",
    fallbackAccessibility:
      "Contexto adicional nao remove o conteudo financeiro principal nem cria dependencia exclusiva de indicacao visual.",
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
  for (const step of steps) {
    currentHtml = await step.transform(currentHtml);
  }

  return currentHtml;
}
