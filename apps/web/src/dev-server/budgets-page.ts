import { formatDateOnly } from "@solverfin/shared";

import {
  renderAlert,
  renderDataTable,
  renderDialog,
  renderDialogTrigger,
  renderEmptyState,
  renderFilterBar,
  renderPageContainer,
  renderPageHeader,
  renderRecoverableError,
  renderSolverFinUiInteractionsScriptTag,
  renderText,
} from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import {
  renderBudgetFocus,
  renderBudgetInventory,
  renderBudgetMoney,
  renderBudgetStatus,
  renderBudgetFocusStyles,
} from "./budgets-focus.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";
import {
  buildBudgetsPageViewModel,
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
  const [usageLoads, dashboardLoad] = await Promise.all([
    loadBudgetUsage(token, budgets),
    loadBudgetDashboardUsage(token, budgets),
  ]);
  const filters = readFilters(url);
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
  }).replace("<button ", '<button data-open-dialog="new-budget-dialog" ');

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
      )}</div>${renderBudgetFilters(viewModel.currencies, filters)}${categoryWarning}${usageWarning}${unbudgetedWarning}${renderBudgetFocus(viewModel.rows)}${renderBudgetTable(viewModel.rows, filters)}${renderBudgetInventory(viewModel)}${renderNewBudgetDialog(categories)}${viewModel.rows
        .filter((row) => row.source === "budget")
        .map((row) => renderBudgetEditDialog(row, categories))
        .join("")}${renderSolverFinUiInteractionsScriptTag()}${budgetRuntimeScript()}</div>`,
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
): Promise<BudgetDashboardUsageLoad> {
  const periods = budgetDashboardPeriods(budgets);
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
  return {
    ...(currency && /^[A-Z]{3}$/.test(currency) ? { currency } : {}),
    ...(status === "active" || status === "archived" ? { status } : {}),
  };
}

function renderBudgetFilters(
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

function renderBudgetTable(
  rows: readonly BudgetRowViewModel[],
  filters: BudgetPresentationFilters,
): string {
  if (rows.length === 0) {
    return `<section class="budget-results panel">${renderEmptyState({
      title:
        filters.currency || filters.status
          ? "Nenhum resultado com estes filtros."
          : "Nenhum item para acompanhar.",
      description:
        filters.currency || filters.status
          ? "Ajuste os filtros de moeda ou estado para consultar outro recorte."
          : "Crie um orçamento ou ajuste os filtros para acompanhar outra moeda ou estado.",
    })}</section>`;
  }

  return `<section class="budget-results panel" aria-labelledby="budgets-list-title"><div class="budget-section-heading"><div><p class="eyebrow">Todos os itens</p><h2 id="budgets-list-title">Acompanhamento detalhado</h2></div><span>${rows.length} item${rows.length === 1 ? "" : "s"}</span></div>${renderDataTable(
    {
      caption: "Orçamentos, categorias sem orçamento e itens sem categoria por período e moeda",
      rows,
      rowKey: (row) => row.id,
      columns: [
        {
          id: "category",
          header: "Categoria",
          renderCell: (row) =>
            `<div class="budget-category"><strong>${renderText(row.categoryName)}</strong>${renderBudgetStatus(row)}</div>`,
        },
        {
          id: "period",
          header: "Período",
          renderCell: (row) =>
            `<span class="budget-period">${renderText(formatDateOnly(row.periodStartOn))}<span aria-hidden="true"> → </span>${renderText(formatDateOnly(row.periodEndOn))}</span>`,
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
          id: "actions",
          header: "Detalhes e ações",
          align: "end",
          renderCell: renderBudgetActions,
        },
      ],
    },
  )}</section>`;
}

function renderAvailableCell(row: BudgetRowViewModel): string {
  if (row.source !== "budget") {
    return '<span class="budget-unavailable">Não se aplica sem orçamento</span>';
  }
  const amount = renderBudgetMoney(row.availableAmountMinor, row.currency);
  if ((row.overBudgetAmountMinor ?? 0) <= 0) return amount;
  return `<div class="budget-available">${amount}<span class="budget-over">Estouro: ${renderBudgetMoney(row.overBudgetAmountMinor, row.currency)}</span></div>`;
}

function renderBudgetActions(row: BudgetRowViewModel): string {
  const details = renderCompositionDetails(row);
  if (row.source === "unbudgeted") {
    return `<div class="budget-row-actions">${details}<span class="budget-unbudgeted-action">Crie um orçamento para definir um valor planejado.</span></div>`;
  }
  if (row.source === "uncategorized") {
    return `<div class="budget-row-actions">${details}<a class="button-link secondary-link" href="/lancamentos">Abrir Extrato para categorizar</a></div>`;
  }
  const editDialogId = `edit-budget-dialog-${row.id}`;
  const editButton = renderDialogTrigger({
    dialogId: editDialogId,
    label: "Editar",
    variant: "secondary",
  }).replace("<button ", `<button data-open-dialog="${renderText(editDialogId)}" `);
  const refreshButton = `<button type="button" class="sf-button sf-button-secondary" data-api-action data-api-method="GET" data-api-path="/api/budgets/${renderText(row.id)}/usage" title="Atualizar acompanhamento">Atualizar</button>`;
  const archiveButton =
    row.status === "archived"
      ? ""
      : `<button type="button" class="sf-button danger-action" data-api-action data-api-method="POST" data-api-path="/api/budgets/${renderText(row.id)}/archive" data-api-confirm="Arquivar este orçamento?">Arquivar</button>`;
  return `<div class="budget-row-actions">${details}${refreshButton}${editButton}${archiveButton}</div>`;
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

function renderNewBudgetDialog(categories: readonly CategoryRecord[]): string {
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

function renderBudgetEditDialog(
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
  return `<label>Categoria<select name="categoryId" required>${renderCategoryOptions(categories, row?.categoryId)}</select></label>
    <label>Início do período<input name="periodStartOn" type="date" value="${renderText(row?.periodStartOn ?? "")}" required></label>
    <label>Fim do período<input name="periodEndOn" type="date" value="${renderText(row?.periodEndOn ?? "")}" required></label>
    <label>Moeda<input name="currency" value="${renderText(row?.currency ?? "")}" inputmode="text" maxlength="3" pattern="[A-Za-z]{3}" placeholder="BRL" autocomplete="off" required></label>
    <label>Valor planejado<input name="plannedAmountMinor" data-money value="${plannedValue}" inputmode="decimal" placeholder="0,00" required></label>`;
}

function renderCategoryOptions(
  categories: readonly CategoryRecord[],
  selectedCategoryId?: string,
): string {
  const activeExpenses = categories.filter(
    (category) => category.kind === "expense" && category.status === "active",
  );
  return activeExpenses
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
    .map(
      (category) =>
        `<option value="${renderText(category.id)}"${selectedCategoryId === category.id ? " selected" : ""}>${renderText(category.name)}</option>`,
    )
    .join("");
}

function formatMoneyInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
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
    .budget-filter-form { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(150px, 220px) minmax(150px, 220px) 1fr; margin-top: 0; width: 100%; }
    .budget-filter-form label { display: grid; gap: 5px; }
    .budget-filter-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .budget-results { display: grid; gap: 12px; min-width: 0; }
    .budget-section-heading { align-items: end; display: flex; gap: 12px; justify-content: space-between; }
    .budget-section-heading > div { display: grid; gap: 2px; }
    .budget-section-heading h2 { margin: 0; }
    .budget-section-heading > span { color: var(--muted); font-size: .8rem; font-weight: 700; }

${renderBudgetFocusStyles()}
    .budget-results .sf-table td[data-column="planned"] .sf-money-value,
    .budget-results .sf-table td[data-column="realized"] .sf-money-value,
    .budget-results .sf-table td[data-column="available"] .sf-money-value { font-weight: 800; }
    .budget-results .sf-table-wrap { overflow-x: auto; }
    .budget-results .sf-table { min-width: 1380px; width: 100%; }
    .budget-results .sf-table th { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
    .budget-results .sf-table th:last-child,
    .budget-results .sf-table td:last-child { position: sticky; right: 0; z-index: 1; box-shadow: -5px 0 12px -12px var(--text); }
    .budget-results .sf-table th:last-child { background: var(--sf-color-background); z-index: 2; }
    .budget-results .sf-table td:last-child { background: var(--surface); }
    .budget-results td { vertical-align: middle; }
    .budget-currency { letter-spacing: .04em; }
    .budget-period { white-space: nowrap; }
    .budget-usage { display: grid; gap: 6px; min-width: 150px; }
    .budget-usage > div { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; justify-content: space-between; }
    .budget-usage progress { accent-color: var(--primary); height: 8px; width: 100%; }
    .budget-usage-unavailable, .budget-unavailable, .budget-unbudgeted-action { color: var(--muted); font-size: .8rem; font-weight: 650; }
    .budget-unbudgeted-plan { color: var(--muted); font-size: .8rem; font-weight: 750; }
    .budget-row-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; min-width: 190px; }
    .budget-row-actions button { white-space: nowrap; }
    .budget-available { display: grid; gap: 3px; }
    .budget-over { color: var(--danger); font-size: .76rem; font-weight: 750; }
    .budget-composition { min-width: 140px; }
    .budget-composition summary { cursor: pointer; font-weight: 700; }
    .budget-composition ul { display: grid; gap: 6px; list-style: none; margin: 8px 0 0; padding: 0; }
    .budget-composition li { display: grid; gap: 2px; text-align: left; }
    .budget-composition li > span:last-child { font-weight: 750; }
    .budget-edit-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .budget-edit-grid label { display: grid; gap: 5px; }
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
      .budget-filter-actions { grid-column: 1 / -1; flex-wrap: nowrap; }
      .budget-filter-actions > * { flex: 1 1 0; min-width: 0; }
      .budget-edit-grid { grid-template-columns: 1fr; }
      .budget-edit-grid .form-status, .budget-edit-grid .budget-form-actions { grid-column: auto; }
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
      .budget-results .sf-table td[data-column="actions"]::before { content: "Detalhes e ações"; }
      .budget-row-actions { justify-content: flex-start; min-width: 0; }
      .budget-row-actions button { flex: 1 1 130px; white-space: normal; }
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
      var root = element.closest("form") || element.closest("td") || element.parentElement;
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
      var normalized = String(value || "").trim().replace(/\\s/g, "").replace(/\\./g, "").replace(",", ".");
      var amount = Number(normalized);
      return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
    }
    function buildPayload(form) {
      var payload = {};
      new FormData(form).forEach(function(value, key) {
        var text = String(value).trim();
        if (!text) return;
        if (key === "plannedAmountMinor") {
          var minor = moneyToMinor(text);
          if (!Number.isFinite(minor)) throw new Error("Informe um valor planejado válido.");
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
