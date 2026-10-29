import { formatDateOnly } from "@solverfin/shared";

import {
  renderAlert,
  renderDataTable,
  renderDialogTrigger,
  renderEmptyState,
  renderPageContainer,
  renderPageHeader,
  renderRecoverableError,
  renderSolverFinUiInteractionsScriptTag,
  renderText,
} from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import {
  renderBudgetActionMenu,
  renderBudgetActionMenuScriptTag,
  renderBudgetActionMenuStyles,
} from "./budgets-action-menu.js";
import {
  renderBudgetFocus,
  renderBudgetInventory,
  renderBudgetMoney,
  renderBudgetStatus,
  renderBudgetFocusStyles,
} from "./budgets-focus.js";
import { renderBudgetFilters } from "./budgets-filters.js";
import { renderBudgetEditDialog, renderNewBudgetDialog } from "./budgets-form.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";
import {
  buildBudgetsPageViewModel,
  parseBudgetPeriod,
  type BudgetPresentationFilters,
  type BudgetRecord,
  type BudgetRowViewModel,
  type BudgetUsageLoad,
  type BudgetUsageRecord,
  type CategoryRecord,
} from "./budgets-view-model.js";

interface BudgetDashboardUsageLoad {
  usage: BudgetUsageRecord[];
  failedPeriodCount: number;
}

export async function renderBudgetsPage(token: string, url?: URL): Promise<string> {
  const [budgetsResult, categoriesResult] = await Promise.all([
    apiGet<{ budgets: BudgetRecord[] }>(token, "/api/budgets?status=all"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?status=all"),
  ]);

  if (!budgetsResult.ok) {
    return renderShell(
      renderPageContainer({
        className: "budgets-a1-page",
        childrenHtml: `<div data-budgets-archetype="A1">${renderPageHeader({
          eyebrow: "Planejamento por categoria",
          title: "Orçamentos",
          description: "Confira o acompanhamento por período e moeda.",
        })}${renderRecoverableError({
          title: "Não foi possível carregar os orçamentos",
          description: budgetsResult.error,
          actionHtml: `<a class="button-link" href="/orcamentos${renderText(url?.search ?? "")}">Tentar novamente</a>`,
        })}</div>`,
      }),
    );
  }

  const budgets = budgetsResult.data.budgets;
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];
  const filters = readFilters(url);
  const [usageLoads, dashboardLoad] = await Promise.all([
    loadBudgetUsage(token, budgets),
    loadBudgetDashboardUsage(token, budgets, filters),
  ]);
  const viewModel = buildBudgetsPageViewModel(
    budgets,
    categories,
    usageLoads,
    filters,
    dashboardLoad.usage,
  );
  const categoryWarning = categoriesResult.ok
    ? ""
    : renderAlert({
        tone: "attention",
        title: "Nomes de categorias parcialmente indisponíveis",
        description:
          "Os valores e períodos permanecem disponíveis, mas alguns nomes podem não ser exibidos.",
      });
  const usageWarning =
    viewModel.unavailableUsageCount > 0
      ? renderAlert({
          tone: "attention",
          title: "Parte do realizado está indisponível",
          description: `${viewModel.unavailableUsageCount} orçamento${viewModel.unavailableUsageCount === 1 ? " não pôde" : "s não puderam"} ser conferido agora. Os valores não foram substituídos por zero.`,
        })
      : "";
  const unbudgetedWarning =
    dashboardLoad.failedPeriodCount > 0
      ? renderAlert({
          tone: "attention",
          title: "Parte das despesas sem orçamento está indisponível",
          description:
            "Não foi possível conferir todas as categorias sem orçamento nos períodos exibidos. Tente novamente para atualizar o acompanhamento.",
        })
      : "";

  const newBudgetTrigger = renderDialogTrigger({
    dialogId: "new-budget-dialog",
    label: "Novo orçamento",
    className: "budget-primary-action",
  })
    .replace("<button ", '<button data-open-dialog="new-budget-dialog" ')
    .replace('<span class="sf-button-label">', `${icon("plus", 16)}<span class="sf-button-label">`);

  return renderShell(
    renderPageContainer({
      className: "budgets-a1-page",
      childrenHtml: `<div data-budgets-archetype="A1"><div class="budgets-heading">${renderPageHeader(
        {
          eyebrow: "Planejamento por categoria",
          title: "Orçamentos",
          description: "Acompanhe planejado, realizado e disponível por período e moeda.",
          actionsHtml: newBudgetTrigger,
        },
      )}</div>${renderBudgetFilters(viewModel.currencies, filters, [currentMonthPeriod(), ...budgets])}${categoryWarning}${usageWarning}${unbudgetedWarning}${renderBudgetFocus(viewModel.rows)}${renderBudgetTable(viewModel.rows, filters)}${renderBudgetInventory(viewModel)}${renderNewBudgetDialog(categories)}${viewModel.rows
        .filter((row) => row.source === "budget")
        .map((row) => renderBudgetEditDialog(row, categories))
        .join(
          "",
        )}${renderSolverFinUiInteractionsScriptTag()}${renderBudgetActionMenuScriptTag()}${budgetRuntimeScript()}</div>`,
    }),
  );
}

async function loadBudgetUsage(
  token: string,
  budgets: readonly BudgetRecord[],
): Promise<Map<string, BudgetUsageLoad>> {
  const pairs = await Promise.all(
    budgets.map(async (budget): Promise<[string, BudgetUsageLoad]> => {
      const result = await apiGet<{ usage: BudgetUsageRecord }>(
        token,
        `/api/budgets/${encodeURIComponent(budget.id)}/usage`,
      );
      return result.ok
        ? [budget.id, { ok: true, usage: result.data.usage }]
        : [budget.id, { ok: false, error: result.error }];
    }),
  );
  return new Map(pairs);
}

async function loadBudgetDashboardUsage(
  token: string,
  budgets: readonly BudgetRecord[],
  filters: BudgetPresentationFilters,
): Promise<BudgetDashboardUsageLoad> {
  const selected = parseBudgetPeriod(filters.period);
  const periods = selected ? [selected] : budgetDashboardPeriods(budgets);
  const results = await Promise.all(
    periods.map(async (period) => {
      const params = new URLSearchParams({
        periodStartOn: period.periodStartOn,
        periodEndOn: period.periodEndOn,
      });
      return apiGet<{ usage: BudgetUsageRecord[] }>(token, `/api/budgets/dashboard?${params}`);
    }),
  );
  const unique = new Map<string, BudgetUsageRecord>();
  let failedPeriodCount = 0;
  for (const result of results) {
    if (!result.ok) {
      failedPeriodCount += 1;
      continue;
    }
    for (const usage of result.data.usage) {
      if (usage.source !== "unbudgeted" && usage.source !== "uncategorized") continue;
      const key = [
        usage.source,
        usage.categoryId ?? "uncategorized",
        usage.periodStartOn,
        usage.periodEndOn,
        usage.currency.trim().toUpperCase(),
      ].join(":");
      unique.set(key, usage);
    }
  }
  return { usage: [...unique.values()], failedPeriodCount };
}

function budgetDashboardPeriods(
  budgets: readonly BudgetRecord[],
): Array<Pick<BudgetRecord, "periodStartOn" | "periodEndOn">> {
  const periods = new Map<string, Pick<BudgetRecord, "periodStartOn" | "periodEndOn">>();
  const current = currentMonthPeriod();
  periods.set(`${current.periodStartOn}:${current.periodEndOn}`, current);
  for (const budget of budgets) {
    if (budget.status !== "active") continue;
    periods.set(`${budget.periodStartOn}:${budget.periodEndOn}`, {
      periodStartOn: budget.periodStartOn,
      periodEndOn: budget.periodEndOn,
    });
  }
  return [...periods.values()];
}

function currentMonthPeriod(
  now: Date = new Date(),
): Pick<BudgetRecord, "periodStartOn" | "periodEndOn"> {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    periodStartOn: start.toISOString().slice(0, 10),
    periodEndOn: end.toISOString().slice(0, 10),
  };
}

function readFilters(url?: URL): BudgetPresentationFilters {
  const currency = url?.searchParams.get("currency")?.trim().toUpperCase();
  const status = url?.searchParams.get("status");
  const period = url?.searchParams.get("period") ?? undefined;
  return {
    ...(currency && /^[A-Z]{3}$/.test(currency) ? { currency } : {}),
    ...(status === "active" || status === "archived" ? { status } : {}),
    ...(period && parseBudgetPeriod(period) ? { period } : {}),
  };
}

function renderBudgetTable(
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

function renderShell(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/orcamentos",
    currentLabel: "Orçamentos",
    content,
    styles: budgetsPageStyles(),
  });
}

function budgetsPageStyles(): string {
  return `${sharedShellStyles()}
${sharedDialogStyles()}
    main { margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; }
    .budgets-a1-page, [data-budgets-archetype="A1"] { display: grid; gap: 16px; min-width: 0; }
    .budgets-heading { display: contents; }
    .budgets-a1-page .sf-page-header { align-items: center; }
    .budget-primary-action { min-height: var(--sf-density-interactive-target-min); }
    .budget-primary-action { white-space: nowrap; }
    .budget-filter-panel { min-width: 0; width: 100%; }
    .budget-filter-toggle { display: none; }
    .budget-filter-form { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(135px, 1fr)) auto; margin-top: 0; width: 100%; }
    .budget-filter-form label { display: grid; gap: 5px; }
    .budget-filter-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .budget-filter-actions > .sf-button { align-items: center; box-sizing: border-box; display: inline-flex; justify-content: center; min-height: var(--sf-density-interactive-target-min); width: 148px; }
    .budget-results { display: grid; gap: 12px; min-width: 0; }
    .budget-section-heading { align-items: end; display: flex; gap: 12px; justify-content: space-between; }
    .budget-section-heading > div { display: grid; gap: 2px; }
    .budget-section-heading h2 { margin: 0; }
    .budget-section-heading > span { color: var(--muted); font-size: .8rem; font-weight: 700; }
    .budget-period-note { color: var(--muted); font-size: .75rem; margin: -6px 0 0; }

${renderBudgetFocusStyles()}
${renderBudgetActionMenuStyles()}
    .budget-results .sf-table td[data-column="planned"] .sf-money-value,
    .budget-results .sf-table td[data-column="realized"] .sf-money-value,
    .budget-results .sf-table td[data-column="available"] .sf-money-value { font-weight: 800; }
    .budget-results .sf-table .sf-money-value { white-space: nowrap; overflow-wrap: normal; word-break: normal; }
    .budget-results .sf-table-wrap { overflow-x: auto; }
    .budget-results .sf-table { min-width: 1380px; width: 100%; }
    .budget-results .sf-table th { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
    .budget-results .sf-table th:last-child,
    .budget-results .sf-table td:last-child { position: sticky; right: 0; z-index: 1; box-shadow: -5px 0 12px -12px var(--text); }
    .budget-results .sf-table th:last-child { background: var(--sf-color-background); z-index: 2; }
    .budget-results .sf-table td:last-child { background: var(--surface); }
    .budget-results .sf-table td:last-child:has(.budget-action-popover:not([hidden])) { z-index: 3; }
    .budget-results .sf-table td[data-column="period"]:has(.budget-action-popover:not([hidden])) { position: relative; z-index: 4; }
    .budget-results td { vertical-align: middle; }
    .budget-currency { letter-spacing: .04em; }
    .budget-period { white-space: nowrap; }
    .budget-category-tree { display: grid; gap: 2px; min-width: 0; padding-inline-start: calc(var(--budget-category-depth, 0) * 10px); }
    .budget-category-tree strong { align-items: baseline; display: flex; gap: 5px; overflow-wrap: anywhere; }
    .budget-category-parent { color: var(--muted); font-size: .7rem; line-height: 1.2; }
    .budget-category-branch { color: var(--muted); }
    .budget-category-tree[data-category-depth]:not([data-category-depth="0"]) { border-inline-start: 1px solid var(--line); }
    .budget-period-history { margin-top: 5px; max-width: 520px; }
    .budget-period-history > summary { color: var(--sf-color-muted-text); cursor: pointer; font-size: .75rem; font-weight: 700; }
    .budget-period-history > ul { display: grid; gap: 8px; list-style: none; margin: 8px 0 0; padding: 0; }
    .budget-history-entry { border-top: 1px solid var(--line); display: grid; gap: 6px; padding-top: 8px; }
    .budget-history-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .budget-history-heading > strong { font-size: .76rem; }
    .budget-history-values { display: grid; gap: 4px 9px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
    .budget-history-values dt { color: var(--muted); font-size: .68rem; }
    .budget-history-values dd { font-size: .77rem; font-weight: 750; margin: 0; }
    .budget-history-entry .budget-composition { min-width: 0; }
    .budget-usage { display: grid; gap: 6px; min-width: 150px; }
    .budget-usage > div { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; justify-content: space-between; }
    .budget-usage progress { accent-color: var(--primary); height: 8px; width: 100%; }
    .budget-usage-unavailable, .budget-unavailable, .budget-unbudgeted-action { color: var(--muted); font-size: .8rem; font-weight: 650; }
    .budget-unbudgeted-plan { color: var(--muted); font-size: .8rem; font-weight: 750; }
    .budget-available { display: grid; gap: 3px; }
    .budget-over { color: var(--danger); font-size: .76rem; font-weight: 750; }
    .budget-composition { min-width: 140px; }
    .budget-composition summary { cursor: pointer; font-weight: 700; }
    .budget-composition ul { display: grid; gap: 6px; list-style: none; margin: 8px 0 0; padding: 0; }
    .budget-composition li { display: grid; gap: 2px; text-align: left; }
    .budget-composition li > span:last-child { font-weight: 750; }
    .budget-edit-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .budget-edit-grid label { display: grid; gap: 5px; min-width: 0; }
    .budget-edit-grid label > input, .budget-edit-grid label > select { min-width: 0; width: 100%; }
    .budget-edit-grid .budget-category-field { grid-column: 1 / -1; }
    .budget-money-field { display: block; min-width: 0; position: relative; }
    .budget-money-prefix { color: var(--sf-color-muted-text); font-weight: var(--sf-font-weight-semibold); left: var(--sf-space-3); pointer-events: none; position: absolute; top: 50%; transform: translateY(-50%); }
    .budget-money-field input { font-variant-numeric: tabular-nums; min-width: 0; padding-inline-start: 60px; text-align: right; width: 100%; }
    .budget-edit-grid .form-status, .budget-edit-grid .budget-form-actions { grid-column: 1 / -1; }
    .budget-form-actions { display: flex; flex-wrap: wrap; gap: var(--sf-space-2); justify-content: flex-end; }
    .budget-form-actions .sf-button { min-height: var(--sf-density-interactive-target-min); }
    .form-status.error { color: var(--danger); }
    .form-status.success { color: var(--success); }
    @media (max-width: 820px) {
      main { padding: 14px 16px 88px; }
      .budgets-a1-page .sf-page-header { align-items: stretch; }
      .budgets-a1-page .sf-page-header-actions, .budgets-a1-page .sf-page-header-actions button { width: 100%; }
      .budget-filter-form { grid-template-columns: 1fr 1fr; }
      .budget-filter-actions { grid-column: 1 / -1; justify-content: stretch; }
      .budget-filter-actions > * { flex: 1 1 160px; justify-content: center; }
    }
    @media (max-width: 560px) {
      .budget-filter-toggle { align-items: center; color: var(--primary); cursor: pointer; display: list-item; font-size: var(--sf-font-size-sm); font-weight: var(--sf-font-weight-semibold); padding: 2px 0; }
      .budget-filter-toggle:focus-visible { border-radius: var(--radius); outline: 2px solid var(--cyan); outline-offset: 3px; }
      .budget-filter-panel[open] > .budget-filter-form { margin-top: var(--sf-space-3); }
      .budget-filter-form { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .budget-filter-form label, .budget-filter-form select { min-width: 0; width: 100%; }
      .budget-filter-form label:first-child { grid-column: 1 / -1; }
      .budget-filter-actions { grid-column: 1 / -1; flex-wrap: nowrap; }
      .budget-filter-actions > * { flex: 1 1 0; min-width: 0; width: 100%; }
      .budget-edit-grid { grid-template-columns: 1fr; }
      .budget-edit-grid .form-status, .budget-edit-grid .budget-form-actions { grid-column: auto; }
      .budget-edit-grid .budget-category-field { grid-column: 1 / -1; }
      .budget-form-actions > * { flex: 1 1 0; }
      .budgets-a1-page .sf-page-header-description { font-size: .82rem; line-height: 1.3; }
      .budget-section-heading { align-items: start; flex-direction: column; }
      .budget-results .sf-table { display: block; min-width: 0; }
      .budget-results .sf-table th:last-child,
      .budget-results .sf-table td:last-child { position: static; right: auto; box-shadow: none; }
      .budget-results .sf-table caption { display: block; }
      .budget-results .sf-table thead { height: 1px; margin: -1px; overflow: hidden; position: absolute; width: 1px; clip: rect(0 0 0 0); }
      .budget-results .sf-table tbody { display: grid; gap: 10px; }
      .budget-results .sf-table tr { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); display: grid; overflow: hidden; }
      .budget-results .sf-table td { align-items: start; border-top: 1px solid var(--line); display: grid; gap: 8px; grid-template-columns: 96px minmax(0, 1fr); padding: 10px; text-align: left; }
      .budget-results .sf-table td:first-child { border-top: 0; }
      .budget-results .sf-table td::before { color: var(--muted); content: attr(data-column); font-size: .7rem; font-weight: 800; text-transform: uppercase; }
      .budget-results .sf-table td[data-column="category"]::before { content: "Categoria"; }
      .budget-results .sf-table td[data-column="period"]::before { content: "Período"; }
      .budget-results .sf-table td[data-column="currency"]::before { content: "Moeda"; }
      .budget-results .sf-table td[data-column="planned"]::before { content: "Planejado"; }
      .budget-results .sf-table td[data-column="realized"]::before { content: "Realizado"; }
      .budget-results .sf-table td[data-column="committed"]::before { content: "Comprometido"; }
      .budget-results .sf-table td[data-column="projected"]::before { content: "Projetado"; }
      .budget-results .sf-table td[data-column="available"]::before { content: "Disponível"; }
      .budget-results .sf-table td[data-column="composition"]::before { content: "Composição"; }
      .budget-results .sf-table td[data-column="actions"]::before { content: "Ações"; }
      .budget-period { white-space: normal; }
      .budget-focus-values { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .budget-focus-values dd { font-size: .87rem; }
      .budget-focus-values .sf-money { column-gap: 2px; }
      .budget-focus-values > div:last-child { grid-column: 1 / -1; }
      .budget-focus-item { padding: 12px; }
      .budget-results .sf-table tbody { gap: 8px; }
      .budget-results .sf-table td { gap: 6px; grid-template-columns: 88px minmax(0, 1fr); padding: 8px 10px; }
      .budget-results .sf-table td[data-column="planned"],
      .budget-results .sf-table td[data-column="realized"],
      .budget-results .sf-table td[data-column="available"] { font-size: 1rem; }
    }`;
}

function budgetRuntimeScript(): string {
  return `<script>(function(){
    if (globalThis.__solverFinBudgetsBound) return;
    globalThis.__solverFinBudgetsBound = true;
    var filterPanel = document.querySelector('[data-budget-mobile-filters]');
    if (filterPanel instanceof HTMLDetailsElement) {
      var mobileFilters = window.matchMedia('(max-width: 560px)');
      var syncFilterDisclosure = function() {
        filterPanel.open = !mobileFilters.matches || filterPanel.dataset.activeFilters === 'true';
      };
      mobileFilters.addEventListener('change', syncFilterDisclosure);
      syncFilterDisclosure();
    }
    function statusFor(element) {
      var root = element.closest("form") || element.closest("td") || element.closest(".budget-focus-item") || element.parentElement;
      var status = root && root.querySelector("[data-form-status]");
      if (!status && root) {
        status = document.createElement("div");
        status.className = "form-status";
        status.setAttribute("aria-live", "polite");
        root.appendChild(status);
      }
      return status;
    }
    function moneyToMinor(value) {
      var normalized = String(value || "").trim();
      if (!/^(?:\\d+|\\d{1,3}(?:\\.\\d{3})+)(?:,\\d{1,2})?$/.test(normalized)) return NaN;
      var parts = normalized.split(",");
      var minor = Number(parts[0].replace(/\\./g, "")) * 100 + Number((parts[1] || "").padEnd(2, "0"));
      return Number.isSafeInteger(minor) ? minor : NaN;
    }
    document.addEventListener("input", function(event) {
      var input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches("[data-budget-money]")) return;
      if (input.value.includes("-")) {
        input.setCustomValidity("O valor planejado não pode ser negativo.");
        return;
      }
      var digits = input.value.replace(/\\D/g, "");
      if (!digits) { input.value = ""; input.setCustomValidity(""); return; }
      var minor = Number(digits);
      if (!Number.isSafeInteger(minor)) {
        input.setCustomValidity("Informe um valor dentro do limite permitido.");
        return;
      }
      input.value = (minor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      input.setCustomValidity("");
    });
    document.addEventListener("change", function(event) {
      var select = event.target;
      if (!(select instanceof HTMLSelectElement) || !select.matches("[data-budget-currency-select]")) return;
      var symbol = select.closest("form")?.querySelector("[data-budget-currency-symbol]");
      if (!symbol) return;
      try {
        var currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: select.value })
          .formatToParts(0).find(function(part) { return part.type === "currency"; });
        symbol.textContent = currency?.value || select.value;
      } catch (_) { symbol.textContent = select.value; }
    });
    function buildPayload(form) {
      var payload = {};
      new FormData(form).forEach(function(value, key) {
        var text = String(value).trim();
        if (!text) return;
        if (key === "plannedAmountMinor") {
          var minor = moneyToMinor(text);
          if (!Number.isSafeInteger(minor)) throw new Error("Informe um valor planejado válido.");
          payload[key] = minor;
        } else if (key === "alertThresholdPercent") {
          payload[key] = Number(text);
        } else if (key === "currency") {
          payload[key] = text.toUpperCase();
        } else {
          payload[key] = text;
        }
      });
      return payload;
    }
    async function readMessage(response) {
      try {
        var body = await response.json();
        if (response.ok) return "Alteração salva.";
        return body && (body.message || body.error && body.error.message) || "Não foi possível salvar a alteração.";
      } catch (_) {
        return response.ok ? "Alteração salva." : "Não foi possível concluir a operação.";
      }
    }
    document.addEventListener("submit", async function(event) {
      var form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !form.matches("[data-api-form]")) return;
      event.preventDefault();
      var status = statusFor(form);
      var button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        var response = await fetch(form.dataset.apiPath, {
          method: form.dataset.apiMethod || "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildPayload(form))
        });
        if (status) { status.className = response.ok ? "form-status success" : "form-status error"; status.textContent = await readMessage(response); }
        if (response.ok) { window.setTimeout(function(){ window.location.reload(); }, 250); return; }
      } catch (error) {
        if (status) { status.className = "form-status error"; status.textContent = error instanceof Error ? error.message : "Não foi possível concluir a operação."; }
      }
      if (button) button.disabled = false;
    });
    document.addEventListener("click", async function(event) {
      var target = event.target instanceof Element ? event.target.closest("[data-api-action]") : null;
      if (!(target instanceof HTMLButtonElement)) return;
      var confirmation = target.dataset.apiConfirm;
      if (confirmation && !window.confirm(confirmation)) return;
      var status = statusFor(target);
      target.disabled = true;
      try {
        var response = await fetch(target.dataset.apiPath, { method: target.dataset.apiMethod || "POST", headers: { "content-type": "application/json" } });
        if (status) { status.className = response.ok ? "form-status success" : "form-status error"; status.textContent = response.ok && (target.dataset.apiMethod || "POST") === "GET" ? "Uso atualizado." : await readMessage(response); }
        if (response.ok) { window.setTimeout(function(){ window.location.reload(); }, 250); return; }
      } catch (_) {
        if (status) { status.className = "form-status error"; status.textContent = "Não foi possível concluir a operação."; }
      }
      target.disabled = false;
    });
  })();</script>`;
}
