import { formatDateOnly } from "@solverfin/shared";

import { renderFilterBar, renderText } from "../design-system/primitives.js";
import type { BudgetPresentationFilters, BudgetRecord } from "./budgets-view-model.js";

export function renderBudgetFilters(
  currencies: readonly string[],
  filters: BudgetPresentationFilters,
  periods: readonly Pick<BudgetRecord, "periodStartOn" | "periodEndOn">[] = [],
): string {
  const hasActiveFilters = Boolean(filters.currency || filters.status || filters.period);
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
  const periodChoices = new Map<string, string>();
  for (const { periodStartOn, periodEndOn } of periods) {
    periodChoices.set(
      `${periodStartOn}:${periodEndOn}`,
      `${formatDateOnly(periodStartOn)} a ${formatDateOnly(periodEndOn)}`,
    );
  }
  if (filters.period && !periodChoices.has(filters.period)) {
    const [start = "", end = ""] = filters.period.split(":");
    periodChoices.set(filters.period, `${formatDateOnly(start)} a ${formatDateOnly(end)}`);
  }
  const periodOptions = [
    '<option value="">Todos os períodos</option>',
    ...[...periodChoices.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(
        ([value, label]) =>
          `<option value="${renderText(value)}"${filters.period === value ? " selected" : ""}>${renderText(label)}</option>`,
      ),
  ].join("");
  const currentPeriod = filters.period ? periodChoices.get(filters.period) : undefined;

  return renderFilterBar({
    label: "Filtros dos orçamentos",
    childrenHtml: `<details class="budget-filter-panel" data-budget-mobile-filters data-active-filters="${hasActiveFilters ? "true" : "false"}" open>
      <summary class="budget-filter-toggle">Filtros de orçamentos${hasActiveFilters ? " (ativos)" : ""}</summary>
      <form class="budget-filter-form" method="get" action="/orcamentos">
        <label>Período<select name="period">${periodOptions}</select></label>
        <label>Moeda<select name="currency">${currencyOptions}</select></label>
        <label>Estado<select name="status">${statusOptions}</select></label>
        <div class="budget-filter-actions"><button type="submit" class="sf-button sf-button-primary sf-focus-ring">Aplicar filtros</button><a class="sf-button sf-button-secondary sf-focus-ring" href="/orcamentos">Limpar</a></div>
      </form>
    </details><p class="budget-filter-context">Recorte atual: período <strong>${renderText(currentPeriod ?? "todos (valores por período, sem consolidação)")}</strong> · moeda <strong>${renderText(filters.currency ?? "todas, sem consolidação")}</strong> · estado <strong>${filters.status === "active" ? "ativos" : filters.status === "archived" ? "arquivados" : "todos"}</strong></p>`,
  });
}
