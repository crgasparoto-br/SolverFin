import { formatDateOnly } from "@solverfin/shared";

import { renderDataTable, renderEmptyState, renderText } from "../design-system/primitives.js";
import { renderBudgetActionMenu } from "./budgets-action-menu.js";
import { renderBudgetMoney, renderBudgetStatus } from "./budgets-focus.js";
import type { BudgetPresentationFilters, BudgetRowViewModel } from "./budgets-view-model.js";

export function renderBudgetTable(
  rows: readonly BudgetRowViewModel[],
  filters: BudgetPresentationFilters,
): string {
  if (rows.length === 0) {
    return `<section class="budget-results panel">${renderEmptyState({
      title:
        filters.currency || filters.status || filters.period
          ? "Nenhum resultado com estes filtros."
          : "Nenhum item para acompanhar.",
      description:
        filters.currency || filters.status || filters.period
          ? "Ajuste os filtros de período, moeda ou estado para consultar outro recorte."
          : "Crie um orçamento ou ajuste os filtros para acompanhar outra moeda ou estado.",
    })}</section>`;
  }

  const displayRows = groupBudgetRowsByCategory(rows);
  return `<section class="budget-results panel" aria-labelledby="budgets-list-title"><div class="budget-section-heading"><div><p class="eyebrow">Por categoria e moeda</p><h2 id="budgets-list-title">Acompanhamento detalhado</h2></div><span>${displayRows.length} categoria${displayRows.length === 1 ? "" : "s"}</span></div><p class="budget-period-note">Valores do período exibido em cada linha; outros períodos disponíveis ao expandir, sem somar moedas ou períodos.</p>${renderDataTable(
    {
      caption: "Uma linha por categoria e moeda, com períodos anteriores expansíveis",
      rows: displayRows,
      rowKey: (row) => row.id,
      columns: [
        {
          id: "category",
          header: "Categoria",
          renderCell: (row) => renderBudgetCategoryTree(row),
        },
        {
          id: "period",
          header: "Período",
          renderCell: (row) => renderBudgetTablePeriod(row),
        },
        {
          id: "currency",
          header: "Moeda",
          renderCell: (row) =>
            row.currency
              ? `<strong class="budget-currency">${renderText(row.currency)}</strong>`
              : '<span class="budget-unavailable">Moeda indisponível</span>',
        },
        {
          id: "planned",
          header: "Planejado",
          align: "end",
          renderCell: (row) =>
            row.source === "budget"
              ? renderBudgetMoney(row.plannedAmountMinor, row.currency)
              : `<span class="budget-unbudgeted-plan">${row.source === "uncategorized" ? "Sem categoria" : "Sem orçamento"}</span>`,
        },
        {
          id: "realized",
          header: "Realizado",
          align: "end",
          renderCell: (row) => renderBudgetMoney(row.actualAmountMinor, row.currency),
        },
        {
          id: "available",
          header: "Disponível",
          align: "end",
          renderCell: (row) => renderAvailableCell(row),
        },
        {
          id: "committed",
          header: "Comprometido",
          align: "end",
          renderCell: (row) => renderBudgetMoney(row.committedAmountMinor, row.currency),
        },
        {
          id: "projected",
          header: "Projetado",
          align: "end",
          renderCell: (row) => renderBudgetMoney(row.projectedAmountMinor, row.currency),
        },
        {
          id: "composition",
          header: "Composição",
          renderCell: renderBudgetComposition,
        },
        {
          id: "actions",
          header: "Ações",
          align: "end",
          renderCell: (row) => renderBudgetActionMenu(row, "table"),
        },
      ],
    },
  )}</section>`;
}

interface BudgetTableRow extends BudgetRowViewModel {
  relatedPeriods: BudgetRowViewModel[];
}

/** Display grouping only: never add monetary amounts across periods or currencies. */
function groupBudgetRowsByCategory(rows: readonly BudgetRowViewModel[]): BudgetTableRow[] {
  const groups = new Map<string, BudgetRowViewModel[]>();
  for (const row of rows) {
    const key = JSON.stringify([
      row.categoryId ?? `source:${row.source}`,
      row.currency ?? "unknown",
    ]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const ordered = [...group].sort(
        (left, right) =>
          right.periodEndOn.localeCompare(left.periodEndOn) ||
          right.periodStartOn.localeCompare(left.periodStartOn) ||
          (left.source === "budget" ? 0 : 1) - (right.source === "budget" ? 0 : 1) ||
          (left.status === "active" ? 0 : 1) - (right.status === "active" ? 0 : 1) ||
          left.id.localeCompare(right.id),
      );
      const [latest, ...relatedPeriods] = ordered;
      if (!latest) throw new Error("Budget category group cannot be empty.");
      return { ...latest, relatedPeriods };
    })
    .sort(
      (left, right) =>
        left.categoryName.localeCompare(right.categoryName, "pt-BR") ||
        (left.currency ?? "").localeCompare(right.currency ?? "") ||
        left.id.localeCompare(right.id),
    );
}

function renderBudgetCategoryTree(row: BudgetTableRow): string {
  const parts = row.categoryPath?.length ? row.categoryPath : [row.categoryName];
  const name = parts[parts.length - 1] ?? row.categoryName;
  const parents = parts.slice(0, -1);
  const depth = Math.min(parents.length, 5);
  const parentLabel = parents.length
    ? `<span class="budget-category-parent">${renderText(parents.join(" › "))}</span>`
    : "";
  const marker =
    depth > 0 ? '<span class="budget-category-branch" aria-hidden="true">↳</span>' : "";
  return `<div class="budget-category">${renderBudgetStatus(row, true)}<div class="budget-category-tree" data-category-depth="${depth}" style="--budget-category-depth:${depth}">${parentLabel}<strong>${marker}${renderText(name)}</strong></div></div>`;
}

function renderBudgetTablePeriod(row: BudgetTableRow): string {
  const current = `<span class="budget-period">${renderText(formatDateOnly(row.periodStartOn))}<span aria-hidden="true"> → </span>${renderText(formatDateOnly(row.periodEndOn))}</span>`;
  if (!row.relatedPeriods.length) return current;
  const older = row.relatedPeriods
    .map(
      (item) =>
        `<li class="budget-history-entry"><div class="budget-history-heading">${renderBudgetStatus(item, true)}<strong>${renderText(formatDateOnly(item.periodStartOn))} a ${renderText(formatDateOnly(item.periodEndOn))}</strong>${renderBudgetActionMenu(item, "history")}</div><dl class="budget-history-values"><div><dt>Planejado</dt><dd>${item.source === "budget" ? renderBudgetMoney(item.plannedAmountMinor, item.currency) : "Sem orçamento"}</dd></div><div><dt>Realizado</dt><dd>${renderBudgetMoney(item.actualAmountMinor, item.currency)}</dd></div><div><dt>Disponível</dt><dd>${renderAvailableCell(item)}</dd></div><div><dt>Comprometido</dt><dd>${renderBudgetMoney(item.committedAmountMinor, item.currency)}</dd></div><div><dt>Projetado</dt><dd>${renderBudgetMoney(item.projectedAmountMinor, item.currency)}</dd></div></dl>${renderCompositionDetails(item)}</li>`,
    )
    .join("");
  const count = row.relatedPeriods.length;
  const label = `${count} outro${count === 1 ? "" : "s"} período${count === 1 ? "" : "s"}`;
  return `${current}<details class="budget-period-history"><summary>${label} — ver valores e ações</summary><ul>${older}</ul></details>`;
}

function renderAvailableCell(row: BudgetRowViewModel): string {
  if (row.source !== "budget") {
    return '<span class="budget-unavailable">Não se aplica sem orçamento</span>';
  }
  const amount = renderBudgetMoney(row.availableAmountMinor, row.currency);
  if ((row.overBudgetAmountMinor ?? 0) <= 0) return amount;
  return `<div class="budget-available">${amount}<span class="budget-over">Estouro: ${renderBudgetMoney(row.overBudgetAmountMinor, row.currency)}</span></div>`;
}

function renderBudgetComposition(row: BudgetRowViewModel): string {
  const details = renderCompositionDetails(row);
  const hint =
    row.source === "unbudgeted"
      ? '<span class="budget-unbudgeted-action">Crie um orçamento para definir um valor planejado.</span>'
      : "";
  return `<div class="budget-composition-cell">${details}${hint}</div>`;
}

function renderCompositionDetails(row: BudgetRowViewModel): string {
  if (row.compositionItems.length === 0) {
    return '<span class="budget-unavailable">Sem itens no recorte</span>';
  }
  const items = row.compositionItems
    .map(
      (item) =>
        `<li><span><strong>${item.state === "realized" ? "Realizado" : "Comprometido"}</strong> · ${renderText(formatDateOnly(item.date))} · ${renderText(item.description)}</span><span>${renderBudgetMoney(item.amountMinor, item.currency)}</span></li>`,
    )
    .join("");
  return `<details class="budget-composition"><summary>Ver itens (${row.compositionItems.length})</summary><ul>${items}</ul></details>`;
}
