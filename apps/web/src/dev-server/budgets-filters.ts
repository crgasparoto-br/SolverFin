import { renderFilterBar, renderText } from "../design-system/primitives.js";
import type { BudgetPresentationFilters } from "./budgets-view-model.js";

export function renderBudgetFilters(
  currencies: readonly string[],
  filters: BudgetPresentationFilters,
): string {
  const visibleCurrencies = Array.from(
    new Set([...currencies, ...(filters.currency ? [filters.currency] : [])]),
  ).sort();
  const currencyOptions = [
    '<option value="">Todas as moedas</option>',
    ...visibleCurrencies.map(
      (currency) =>
        `<option value="${renderText(currency)}"${filters.currency === currency ? " selected" : ""}>${renderText(currency)}</option>`,
    ),
  ].join("");
  const statusOptions = [
    ["", "Todos os estados"],
    ["active", "Ativos"],
    ["archived", "Arquivados"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${filters.status === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");

  return renderFilterBar({
    label: "Filtros dos orçamentos",
    childrenHtml: `<details class="budget-filter-panel" data-budget-mobile-filters data-active-filters="${filters.currency || filters.status ? "true" : "false"}" open>
      <summary class="budget-filter-toggle">Filtros de orçamentos${filters.currency || filters.status ? " (ativos)" : ""}</summary>
      <form class="budget-filter-form" method="get" action="/orcamentos">
        <label>Moeda<select name="currency">${currencyOptions}</select></label>
        <label>Estado<select name="status">${statusOptions}</select></label>
        <div class="budget-filter-actions"><button type="submit" class="sf-button sf-button-primary">Aplicar filtros</button><a class="button-link secondary-link" href="/orcamentos">Limpar</a></div>
      </form>
    </details><p class="budget-filter-context">Recorte atual: moeda <strong>${renderText(filters.currency ?? "todas, sem consolidação")}</strong> · estado <strong>${filters.status === "active" ? "ativos" : filters.status === "archived" ? "arquivados" : "todos"}</strong></p>`,
  });
}

