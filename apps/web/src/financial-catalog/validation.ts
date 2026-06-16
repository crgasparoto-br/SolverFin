import type {
  FinancialAccount,
  FinancialAccountFormInput,
  FinancialCard,
  FinancialCardFormInput,
  FinancialCatalogContext,
  FinancialCatalogDataSet,
  FinancialCatalogEntity,
  FinancialCatalogItemStatus,
  FinancialCatalogSectionSummary,
  FinancialCatalogStateKind,
  FinancialCatalogValidationIssue,
  FinancialCatalogValidationResult,
  FinancialCatalogViewModel,
  FinancialCategory,
  FinancialCategoryFormInput,
} from "./types.js";

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
const cardDigitsPattern = /^[0-9]{4}$/;

export function buildFinancialCatalogViewModel(
  dataSet: FinancialCatalogDataSet | undefined,
  state: FinancialCatalogStateKind = "ready",
): FinancialCatalogViewModel {
  if (dataSet === undefined) {
    return buildUnavailableCatalog(state);
  }

  const accounts = filterByContext(dataSet.accounts, dataSet.context);
  const cards = filterByContext(dataSet.cards, dataSet.context).map(maskFinancialCard);
  const categories = filterByContext(dataSet.categories, dataSet.context);
  const hasItems = accounts.length > 0 || cards.length > 0 || categories.length > 0;

  if (!hasItems && state === "ready") {
    return {
      state: "empty",
      title: "Configure sua base financeira",
      description: "Cadastre contas, cartoes e categorias para iniciar seus lancamentos.",
      context: dataSet.context,
      accounts,
      cards,
      categories,
      sections: buildSectionSummaries(accounts, cards, categories),
    };
  }

  const viewModel: FinancialCatalogViewModel = {
    state,
    title: "Cadastros financeiros",
    description: "Organize contas, cartoes e categorias usados no controle diario.",
    context: dataSet.context,
    accounts,
    cards,
    categories,
    sections: buildSectionSummaries(accounts, cards, categories),
  };

  if (state === "success") {
    viewModel.feedbackMessage = "Alteracao salva. Seus cadastros ja podem ser usados nos lancamentos.";
  }

  return viewModel;
}

export function validateAccountForm(input: FinancialAccountFormInput): FinancialCatalogValidationResult {
  const issues: FinancialCatalogValidationIssue[] = [];

  addRequiredTextIssue(issues, "name", input.name, "Informe o nome da conta.");

  if (input.type === "") {
    issues.push({ field: "type", message: "Escolha o tipo da conta." });
  }

  if (input.openingBalanceInCents !== undefined && !Number.isInteger(input.openingBalanceInCents)) {
    issues.push({ field: "openingBalanceInCents", message: "Informe um valor inicial valido." });
  }

  addColorIssue(issues, input.color);

  return toValidationResult(issues);
}

export function validateCardForm(input: FinancialCardFormInput): FinancialCatalogValidationResult {
  const issues: FinancialCatalogValidationIssue[] = [];

  addRequiredTextIssue(issues, "nickname", input.nickname, "Informe o apelido do cartao.");

  if (input.type === "") {
    issues.push({ field: "type", message: "Escolha o tipo do cartao." });
  }

  addDayIssue(issues, "closingDay", input.closingDay, "O fechamento deve ficar entre 1 e 31.");
  addDayIssue(issues, "dueDay", input.dueDay, "O vencimento deve ficar entre 1 e 31.");

  if (input.lastFourDigits !== undefined && !cardDigitsPattern.test(input.lastFourDigits)) {
    issues.push({ field: "lastFourDigits", message: "Use apenas os 4 ultimos digitos do cartao." });
  }

  return toValidationResult(issues);
}

export function validateCategoryForm(
  input: FinancialCategoryFormInput,
): FinancialCatalogValidationResult {
  const issues: FinancialCatalogValidationIssue[] = [];

  addRequiredTextIssue(issues, "name", input.name, "Informe o nome da categoria.");

  if (input.type === "") {
    issues.push({ field: "type", message: "Escolha se a categoria e de receita, despesa ou transferencia." });
  }

  addColorIssue(issues, input.color);

  return toValidationResult(issues);
}

export function canArchiveCategory(category: FinancialCategory): FinancialCatalogValidationResult {
  if (category.isSystem === true) {
    return toValidationResult([
      { field: "category", message: "Categorias do sistema nao podem ser arquivadas." },
    ]);
  }

  return toValidationResult([]);
}

export function getArchiveActionLabel(status: FinancialCatalogItemStatus): string {
  return status === "archived" ? "Reativar" : "Arquivar";
}

export function maskFinancialCard(card: FinancialCard): FinancialCard {
  if (card.lastFourDigits === undefined) {
    return card;
  }

  return {
    ...card,
    lastFourDigits: `•••• ${card.lastFourDigits}`,
  };
}

export function filterByContext<T extends FinancialAccount | FinancialCard | FinancialCategory>(
  items: readonly T[],
  context: FinancialCatalogContext,
): T[] {
  return items.filter(
    (item) =>
      item.tenantId === context.tenantId && item.financialProfileId === context.financialProfileId,
  );
}

function buildUnavailableCatalog(state: FinancialCatalogStateKind): FinancialCatalogViewModel {
  const fallbackContext = {
    tenantId: "tenant-pendente",
    financialProfileId: "profile-pendente",
  };

  return {
    state,
    title: state === "error" ? "Nao foi possivel carregar os cadastros" : "Carregando cadastros",
    description:
      state === "error"
        ? "Tente novamente para configurar contas, cartoes e categorias."
        : "Estamos preparando seus cadastros financeiros.",
    context: fallbackContext,
    accounts: [],
    cards: [],
    categories: [],
    sections: buildSectionSummaries([], [], []),
  };
}

function buildSectionSummaries(
  accounts: readonly FinancialAccount[],
  cards: readonly FinancialCard[],
  categories: readonly FinancialCategory[],
): FinancialCatalogSectionSummary[] {
  return [
    buildSectionSummary("account", "Contas", "Contas usadas para saldo e lancamentos.", accounts),
    buildSectionSummary("card", "Cartoes", "Cartoes e faturas para compras recorrentes.", cards),
    buildSectionSummary("category", "Categorias", "Classificacao de receitas e despesas.", categories),
  ];
}

function buildSectionSummary(
  entity: FinancialCatalogEntity,
  title: string,
  description: string,
  items: readonly { status: FinancialCatalogItemStatus }[],
): FinancialCatalogSectionSummary {
  return {
    entity,
    title,
    description,
    activeCount: items.filter((item) => item.status === "active").length,
    archivedCount: items.filter((item) => item.status === "archived").length,
  };
}

function addRequiredTextIssue(
  issues: FinancialCatalogValidationIssue[],
  field: string,
  value: string,
  message: string,
): void {
  if (value.trim().length === 0) {
    issues.push({ field, message });
  }
}

function addColorIssue(issues: FinancialCatalogValidationIssue[], color: string | undefined): void {
  if (color !== undefined && !hexColorPattern.test(color)) {
    issues.push({ field: "color", message: "Use uma cor em formato hexadecimal, como #16A34A." });
  }
}

function addDayIssue(
  issues: FinancialCatalogValidationIssue[],
  field: string,
  value: number | undefined,
  message: string,
): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 31)) {
    issues.push({ field, message });
  }
}

function toValidationResult(
  issues: readonly FinancialCatalogValidationIssue[],
): FinancialCatalogValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}
