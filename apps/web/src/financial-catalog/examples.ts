import { financialCatalogMockDataSet } from "./mock-data.js";
import {
  buildFinancialCatalogViewModel,
  canArchiveCategory,
  validateAccountForm,
  validateCardForm,
  validateCategoryForm,
} from "./validation.js";

export const financialCatalogReadyExample = buildFinancialCatalogViewModel(financialCatalogMockDataSet);
export const financialCatalogLoadingExample = buildFinancialCatalogViewModel(undefined, "loading");
export const financialCatalogErrorExample = buildFinancialCatalogViewModel(undefined, "error");
export const financialCatalogSuccessExample = buildFinancialCatalogViewModel(
  financialCatalogMockDataSet,
  "success",
);
export const financialCatalogEmptyExample = buildFinancialCatalogViewModel({
  context: financialCatalogMockDataSet.context,
  accounts: [],
  cards: [],
  categories: [],
});

export const invalidAccountExample = validateAccountForm({
  name: "",
  type: "",
});

export const validAccountExample = validateAccountForm({
  name: "Conta reserva demo",
  type: "savings",
  openingBalanceInCents: 120000,
  color: "#22D3EE",
});

export const invalidCardExample = validateCardForm({
  nickname: "",
  type: "credit",
  closingDay: 35,
  dueDay: 0,
  lastFourDigits: "12345",
});

export const validCategoryExample = validateCategoryForm({
  name: "Transporte",
  type: "expense",
  color: "#F59E0B",
});

export const systemCategoryArchiveExample = canArchiveCategory(financialCatalogMockDataSet.categories[0]);

export const financialCatalogExpectedCounts = {
  accounts: 2,
  cards: 2,
  categories: 3,
  activeAccounts: 1,
  archivedAccounts: 1,
} as const;

export function isFinancialCatalogMockConsistent(): boolean {
  const accountSummary = financialCatalogReadyExample.sections.find(
    (section) => section.entity === "account",
  );

  return (
    financialCatalogReadyExample.accounts.length === financialCatalogExpectedCounts.accounts &&
    financialCatalogReadyExample.cards.length === financialCatalogExpectedCounts.cards &&
    financialCatalogReadyExample.categories.length === financialCatalogExpectedCounts.categories &&
    accountSummary?.activeCount === financialCatalogExpectedCounts.activeAccounts &&
    accountSummary.archivedCount === financialCatalogExpectedCounts.archivedAccounts &&
    invalidAccountExample.valid === false &&
    validAccountExample.valid === true &&
    invalidCardExample.valid === false &&
    validCategoryExample.valid === true &&
    systemCategoryArchiveExample.valid === false
  );
}
