import { formatDateOnly } from "@solverfin/shared";

import { renderMoney } from "../design-system/money.js";
import { renderText } from "../design-system/primitives.js";
import { icon } from "./icons.js";
import { renderBudgetActionMenu } from "./budgets-action-menu.js";
import type { BudgetsPageViewModel, BudgetRowViewModel } from "./budgets-view-model.js";

function budgetFocusPriority(row: BudgetRowViewModel): number {
  if (row.status === "archived") return 7;
  if (row.source === "budget") {
    if (row.usageStatus === "exceeded") return 0;
    if (row.usageStatus === "approaching") return 1;
    if (row.usageStatus === "unavailable") return 2;
    return 3;
  }
  return row.source === "unbudgeted" ? 4 : 5;
}

export function renderBudgetFocus(rows: readonly BudgetRowViewModel[]): string {
  if (rows.length === 0) return "";
  const shownCurrencies = new Set<string>();
  const featured = [...rows]
    .sort((left, right) => budgetFocusPriority(left) - budgetFocusPriority(right))
    .filter((row) => {
      const currencyKey = row.currency ?? `unknown:${row.id}`;
      if (shownCurrencies.has(currencyKey)) return false;
      shownCurrencies.add(currencyKey);
      return true;
    })
    .slice(0, 3);

  return `<section class="budget-focus" aria-labelledby="budget-focus-title">
    <div class="budget-focus-title"><div><p class="eyebrow">Prioridade financeira</p><h2 id="budget-focus-title">Planejado, realizado e disponível</h2></div><p>Um destaque por moeda, sem somar moedas diferentes.</p></div>
    <div class="budget-focus-grid">${featured.map(renderBudgetFocusItem).join("")}</div>
  </section>`;
}

function renderBudgetFocusItem(row: BudgetRowViewModel): string {
  const planned =
    row.source === "budget"
      ? renderBudgetMoney(row.plannedAmountMinor, row.currency)
      : `<span class="budget-unbudgeted-plan">${row.source === "uncategorized" ? "Sem categoria" : "Sem orçamento"}</span>`;
  const available =
    row.source === "budget"
      ? renderBudgetMoney(row.availableAmountMinor, row.currency)
      : '<span class="budget-unavailable">Não se aplica sem orçamento</span>';
  const remaining =
    row.source === "budget"
      ? `<p class="budget-focus-remaining">Restante (antes dos compromissos): ${renderBudgetMoney(row.remainingAmountMinor, row.currency)}</p>`
      : "";
  const overBudget =
    row.source === "budget" && row.overBudgetAmountMinor !== null && row.overBudgetAmountMinor > 0
      ? `<p class="budget-over">Estouro previsto: ${renderBudgetMoney(row.overBudgetAmountMinor, row.currency)}</p>`
      : "";
  return `<article class="budget-focus-item">
    <div class="budget-focus-item-header"><div class="budget-focus-item-context"><div class="budget-focus-category">${renderBudgetStatus(row, true)}<h3>${renderText(row.categoryName)}</h3></div><p class="budget-focus-meta">${renderText(formatDateOnly(row.periodStartOn))} a ${renderText(formatDateOnly(row.periodEndOn))} · ${row.currency ? `<strong class="budget-currency">${renderText(row.currency)}</strong>` : "Moeda indisponível"}</p></div><div class="budget-focus-head-actions">${renderBudgetActionMenu(row, "focus")}</div></div>
    <dl class="budget-focus-values"><div><dt>Planejado</dt><dd>${planned}</dd></div><div><dt>Realizado</dt><dd>${renderBudgetMoney(row.actualAmountMinor, row.currency)}</dd></div><div><dt>Disponível</dt><dd>${available}</dd></div></dl>
    ${remaining}${overBudget}
  </article>`;
}

export function renderBudgetStatus(row: BudgetRowViewModel, compact = false): string {
  const status = row.status === "archived" ? "archived" : row.usageStatus;
  const labels: Record<string, string> = {
    archived: "Arquivado",
    no_activity: "Sem movimentação",
    on_track: "Dentro do planejamento",
    approaching: "Próximo do limite",
    exceeded: "Acima do planejado",
    unbudgeted: "Sem orçamento",
    uncategorized: "Sem categoria",
    unavailable: "Acompanhamento indisponível",
  };
  const glyphs = {
    archived: "archive",
    no_activity: "clock",
    on_track: "check-circle",
    approaching: "alert-triangle",
    exceeded: "x-circle",
    unbudgeted: "info",
    uncategorized: "tag",
    unavailable: "info",
  } as const;
  const glyph = glyphs[status as keyof typeof glyphs] ?? "info";
  const label = labels[status] ?? "Situação não identificada";
  const tone =
    status === "exceeded" || status === "approaching"
      ? "attention"
      : status === "on_track"
        ? "positive"
        : "neutral";
  return `<span role="img" class="budget-state budget-state--${tone}" data-budget-state="${renderText(status)}" title="${renderText(label)}" aria-label="${renderText(label)}">${icon(glyph, 16)}${compact ? "" : `<span class="budget-state-label">${renderText(label)}</span>`}</span>`;
}

export function renderBudgetInventory(viewModel: BudgetsPageViewModel): string {
  const visibleCurrencyCount = new Set(viewModel.rows.map((row) => row.currency).filter(Boolean))
    .size;
  return `<section class="budget-inventory" aria-labelledby="budget-inventory-title">
    <h2 id="budget-inventory-title">Contagens auxiliares</h2>
    <dl><div><dt>Ativos</dt><dd>${viewModel.activeCount}</dd></div><div><dt>Sem orçamento</dt><dd>${viewModel.unbudgetedCount}</dd></div><div><dt>Sem categoria</dt><dd>${viewModel.uncategorizedCount}</dd></div><div><dt>Moedas no recorte</dt><dd>${visibleCurrencyCount}</dd></div></dl>
  </section>`;
}

export function renderBudgetMoney(
  amountMinor: number | null,
  currency: string | undefined,
): string {
  if (!currency) return '<span class="budget-unavailable">Indisponível sem moeda</span>';
  return renderMoney({
    amountMinor,
    currency,
    showCurrencyCode: false, // Explicit currency in the budget card header or table column.
    ...(amountMinor === null ? { unavailableLabel: "Indisponível" } : {}),
  });
}

export function renderBudgetFocusStyles(): string {
  return `    .budget-filter-context { color: var(--muted); font-size: .78rem; margin: 0; }
    .budget-filter-context strong { color: var(--text); font-weight: 700; }
    .budget-focus { display: grid; gap: 10px; min-width: 0; }
    .budget-focus-title { align-items: end; display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; }
    .budget-focus-title h2 { font-size: 1.2rem; margin: 0; }
    .budget-focus-title > p { color: var(--muted); font-size: .78rem; margin: 0; max-width: 460px; }
    .budget-focus-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 265px), 1fr)); min-width: 0; }
    .budget-focus-item { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 12px; min-width: 0; padding: 14px 16px; }
    .budget-focus-item-header { align-items: start; display: flex; flex-wrap: wrap; gap: 6px 10px; justify-content: space-between; min-width: 0; }
    .budget-focus-item-context { min-width: 0; }
    .budget-focus-category { align-items: flex-start; display: flex; gap: 8px; min-width: 0; }
    .budget-focus-category .budget-state { flex: none; margin-top: 2px; }
    .budget-focus-item h3 { font-size: .96rem; line-height: 1.3; margin: 0; overflow-wrap: anywhere; }
    .budget-focus-meta { color: var(--muted); font-size: .76rem; margin: 3px 0 0; }
    .budget-focus-values { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; min-width: 0; }
    .budget-focus-values > div { min-width: 0; }
    .budget-focus-values dt { color: var(--muted); font-size: .73rem; font-weight: 700; }
    .budget-focus-values dd { font-size: 1.04rem; font-variant-numeric: tabular-nums; font-weight: 800; margin: 3px 0 0; overflow-wrap: anywhere; }
    .budget-focus-values .sf-money { display: inline-flex; flex-wrap: wrap; gap: 2px 4px; white-space: normal; }
    .budget-focus-remaining { color: var(--muted); font-size: .76rem; margin: 0; }
    .budget-focus-remaining .sf-money { color: var(--text); font-weight: 700; }
    .budget-state { align-items: center; color: var(--sf-color-muted-text); display: inline-flex; font-size: .73rem; font-weight: 750; gap: 5px; line-height: 1.35; overflow-wrap: anywhere; }
    .budget-state svg { flex: none; }
    .budget-state--attention { color: var(--sf-color-danger); }
    .budget-state--positive { color: var(--sf-color-success); }
    .budget-inventory { align-items: baseline; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 9px 0 0; }
    .budget-inventory h2 { color: var(--muted); font-size: .78rem; font-weight: 700; margin: 0; }
    .budget-inventory dl { display: flex; flex-wrap: wrap; gap: 7px 16px; margin: 0; }
    .budget-inventory dl > div { align-items: baseline; display: flex; gap: 5px; }
    .budget-inventory dt { color: var(--muted); font-size: .74rem; }
    .budget-inventory dd { color: var(--text); font-size: .82rem; font-variant-numeric: tabular-nums; font-weight: 800; margin: 0; }
    .budget-category { align-items: flex-start; display: flex; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
    .budget-category .budget-state { flex: none; margin-top: 1px; }
    .budget-category strong { min-width: 0; }
    .budget-results .sf-table th, .budget-results .sf-table td { padding: 8px 10px; }
`;
}
