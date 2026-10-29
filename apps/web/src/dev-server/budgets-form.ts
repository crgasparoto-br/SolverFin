import { formatDateOnly } from "@solverfin/shared";

import { renderDialog, renderText } from "../design-system/primitives.js";
import { formatMoneyInput } from "./accounts-cards/presentation.js";
import { accountCurrencies } from "./accounts-cards/view-model.js";
import {
  buildCategoryPath,
  type BudgetRowViewModel,
  type CategoryRecord,
} from "./budgets-view-model.js";

export function renderNewBudgetDialog(categories: readonly CategoryRecord[]): string {
  return renderDialog({
    id: "new-budget-dialog",
    title: "Novo orçamento",
    description: "Defina categoria, período, moeda e valor planejado.",
    bodyHtml: `<form id="new-budget-form" data-api-form data-api-path="/api/budgets" class="budget-edit-grid">
      ${renderBudgetFields(categories)}
      <div class="form-status" data-form-status aria-live="polite"></div>
      ${renderBudgetFormActions("Criar orçamento")}
    </form>`,
  });
}

export function renderBudgetEditDialog(
  row: BudgetRowViewModel,
  categories: readonly CategoryRecord[],
): string {
  return renderDialog({
    id: `edit-budget-dialog-${row.id}`,
    title: `Editar orçamento de ${row.categoryName}`,
    description: `${formatDateOnly(row.periodStartOn)} a ${formatDateOnly(row.periodEndOn)}${row.currency ? ` · ${row.currency}` : ""}`,
    bodyHtml: `<form data-api-form data-api-method="PATCH" data-api-path="/api/budgets/${renderText(row.id)}" class="budget-edit-grid">
      ${renderBudgetFields(categories, row)}
      <div class="form-status" data-form-status aria-live="polite"></div>
      ${renderBudgetFormActions("Salvar alterações")}
    </form>`,
  });
}

function renderBudgetFormActions(submitLabel: string): string {
  return `<div class="budget-form-actions"><button type="button" class="sf-button sf-button-secondary" data-sf-dialog-close>Cancelar</button><button type="submit" class="sf-button sf-button-primary">${renderText(submitLabel)}</button></div>`;
}

function renderBudgetFields(
  categories: readonly CategoryRecord[],
  row?: BudgetRowViewModel,
): string {
  const plannedValue =
    row?.source === "budget" && row.plannedAmountMinor !== null
      ? renderText(formatMoneyInput(row.plannedAmountMinor))
      : "";
  const selectedCurrency = row ? row.currency : "BRL";
  const currencySymbol = selectedCurrency
    ? (new Intl.NumberFormat("pt-BR", { style: "currency", currency: selectedCurrency })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? selectedCurrency)
    : "";
  return `<label class="budget-category-field">Categoria
      <select name="categoryId" required>${renderCategoryOptions(categories, row?.categoryId)}</select></label>
    <label>Início do período<input name="periodStartOn" type="date" value="${renderText(row?.periodStartOn ?? "")}" required></label>
    <label>Fim do período<input name="periodEndOn" type="date" value="${renderText(row?.periodEndOn ?? "")}" required></label>
    <label>Moeda<select name="currency" data-budget-currency-select required>${renderBudgetCurrencyOptions(selectedCurrency)}</select></label>
    <label>Valor planejado<span class="budget-money-field"><span class="budget-money-prefix" data-budget-currency-symbol aria-hidden="true">${renderText(currencySymbol)}</span><input name="plannedAmountMinor" data-money data-budget-money value="${plannedValue}" inputmode="decimal" autocomplete="off" placeholder="0,00" required></span></label>`;
}

function renderCategoryOptions(
  categories: readonly CategoryRecord[],
  selectedCategoryId?: string,
): string {
  const index = new Map(categories.map((category) => [category.id, category]));
  const expenseCategories = categories
    .filter(
      (category) =>
        category.kind === "expense" &&
        (category.status === "active" || category.id === selectedCategoryId),
    )
    .map((category) => ({
      category,
      path: buildCategoryPath(category.id, index),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "pt-BR"));
  const stillAvailable = expenseCategories.some(
    ({ category }) => category.id === selectedCategoryId,
  );
  const placeholder =
    selectedCategoryId && !stillAvailable
      ? `<option value="" disabled selected>Categoria anterior indisponível — selecione outra</option>`
      : `<option value="" disabled${!selectedCategoryId ? " selected" : ""}>Selecione uma categoria</option>`;
  return (
    placeholder +
    expenseCategories
      .map(
        ({ category, path }) =>
          `<option value="${renderText(category.id)}"${selectedCategoryId === category.id ? " selected" : ""}>${renderText(path)}${category.status !== "active" ? " (arquivada)" : ""}</option>`,
      )
      .join("")
  );
}

function renderBudgetCurrencyOptions(selectedCurrency?: string): string {
  const options: string[] = [...accountCurrencies];
  if (
    selectedCurrency &&
    /^[A-Z]{3}$/.test(selectedCurrency) &&
    !options.includes(selectedCurrency)
  ) {
    // Existing budgets may use a valid legacy currency outside the account catalog.
    options.push(selectedCurrency);
  }
  const placeholder = selectedCurrency
    ? ""
    : '<option value="" disabled selected>Selecione uma moeda</option>';
  return (
    placeholder +
    options
      .map(
        (currency) =>
          `<option value="${renderText(currency)}"${selectedCurrency === currency ? " selected" : ""}>${renderText(currency)}${accountCurrencies.some((available) => available === currency) ? "" : " (já cadastrada)"}</option>`,
      )
      .join("")
  );
}
