import { renderMoney } from "../design-system/money.js";
import { apiGet } from "./api.js";
import {
  renderAnalysisHighlights,
  renderReportAnalysisBlock,
  renderResultTrend,
} from "./reports-analysis-archetype.js";
import { buildCategoryEvolutionAnalysisViewModel } from "./reports-analysis-view-model.js";
import { renderCategoryEvolutionRuntime } from "./reports-category-evolution-runtime.js";
import { renderInstallmentsView } from "./reports-installments-view.js";
import {
  escapeReportHtml as escapeHtml,
  renderReportHeading as renderHeading,
  renderReportState as renderState,
  renderReportsShell as renderShell,
  renderReportViewNavigation as renderViewNavigation,
  type ReportsView,
} from "./reports-route-page-shared.js";

export type { ReportsView } from "./reports-route-page-shared.js";
type ReportInterval = "monthly" | "annual" | "rolling-year";

interface ViewResolution {
  view?: ReportsView;
  error?: string;
}

interface EvolutionFilters {
  interval: ReportInterval;
  start: string;
  periods: number;
  profileId?: string;
  accountId?: string;
  cardId?: string;
}

interface EvolutionFilterFormValues {
  interval: ReportInterval;
  intervalValue: string;
  start: string;
  periods: string;
  profileId?: string;
  accountId: string;
  cardId: string;
  invalid: {
    interval: boolean;
    start: boolean;
    periods: boolean;
    accountId: boolean;
    cardId: boolean;
    sourceConflict: boolean;
  };
}

interface ReportAccount {
  id: string;
  name: string;
  status: string;
}

interface ReportCreditCardAccount {
  id: string;
  name: string;
  status: string;
}

interface ReportCell {
  amountMinor: number;
  percentage: number | null;
}

interface ReportSeries {
  cells: ReportCell[];
  totalMinor: number;
  totalPercentage: number | null;
  averageMinor: number;
  averagePercentage: number | null;
}

interface ReportCategoryNode {
  categoryId: string | null;
  name: string;
  status: string;
  series: ReportSeries;
  children: ReportCategoryNode[];
}

interface CategoryEvolutionReport {
  interval: ReportInterval;
  start: string;
  periodCount: number;
  periods: Array<{
    key: string;
    label: string;
    accessibleLabel: string;
    startsOn: string;
    endsOn: string;
  }>;
  currencyBlocks: Array<{
    currency: string;
    income: ReportSeries;
    incomeCategories: ReportCategoryNode[];
    expense: ReportSeries;
    expenseCategories: ReportCategoryNode[];
    result: ReportSeries;
  }>;
}

interface RenderedCategoryBranch {
  html: string;
  rowIds: string[];
}

const LEGACY_FILTERS = ["month", "status", "cardId", "categoryId"] as const;
const EVOLUTION_FILTERS = ["interval", "start", "periods", "accountId"] as const;
const INTERVAL_LIMITS: Record<ReportInterval, { defaultPeriods: number; maxPeriods: number }> = {
  monthly: { defaultPeriods: 12, maxPeriods: 24 },
  annual: { defaultPeriods: 3, maxPeriods: 10 },
  "rolling-year": { defaultPeriods: 3, maxPeriods: 10 },
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function renderReportsRoutePage(
  token: string,
  url: URL,
  referenceDate: Date = new Date(),
): Promise<string> {
  const resolution = resolveReportsView(url);
  if (resolution.error || !resolution.view) {
    return renderShell(
      renderHeading("Relatórios", "Escolha uma visão compatível com os filtros informados.") +
        renderViewNavigation("category-evolution", url.searchParams.get("profileId") ?? undefined) +
        renderState(
          "filter-error",
          "Não foi possível aplicar os filtros",
          resolution.error ?? "Revise os filtros e tente novamente.",
        ),
    );
  }

  return resolution.view === "installments"
    ? renderInstallmentsView(token, url)
    : renderCategoryEvolutionView(token, url, referenceDate);
}

export function resolveReportsView(url: URL): ViewResolution {
  const explicit = url.searchParams.get("view");
  if (explicit !== null) {
    if (explicit === "category-evolution" || explicit === "installments") return { view: explicit };
    return { error: "Visão inválida. Escolha Evolução por categoria ou Parcelas consolidadas." };
  }

  const hasLegacy = LEGACY_FILTERS.some((key) => url.searchParams.has(key));
  const hasEvolution = EVOLUTION_FILTERS.some((key) => url.searchParams.has(key));
  if (hasLegacy && hasEvolution) {
    return {
      error:
        "Os filtros de evolução e parcelas foram misturados. Escolha uma visão para continuar.",
    };
  }
  if (hasLegacy) return { view: "installments" };
  return { view: "category-evolution" };
}

async function renderCategoryEvolutionView(
  token: string,
  url: URL,
  referenceDate: Date,
): Promise<string> {
  let filters: EvolutionFilters;
  try {
    filters = readEvolutionFilters(url, referenceDate);
  } catch (error) {
    const draft = readEvolutionFilterDraft(url, referenceDate);
    return renderShell(
      renderHeading(
        "Evolução por categoria",
        "Acompanhe receitas, despesas e resultado ao longo do tempo.",
      ) +
        renderViewNavigation("category-evolution", draft.profileId) +
        renderEvolutionFilterForm(draft, [], []) +
        renderState(
          "filter-error",
          "Revise os filtros",
          error instanceof Error ? error.message : "Os filtros informados são inválidos.",
        ) +
        renderCategoryEvolutionRuntime(),
    );
  }

  const heading = renderHeading(
    "Evolução por categoria",
    "Acompanhe receitas, despesas e resultado por período, moeda, conta ou cartão.",
  );
  const navigation = renderViewNavigation("category-evolution", filters.profileId);
  const [accountsResult, cardsResult] = await Promise.all([
    apiGet<{ accounts: ReportAccount[] }>(token, buildAccountsApiPath(filters.profileId)),
    apiGet<{ creditCardAccounts: ReportCreditCardAccount[] }>(
      token,
      buildCreditCardAccountsApiPath(filters.profileId),
    ),
  ]);

  if (!accountsResult.ok || !cardsResult.ok) {
    const sourceError = !accountsResult.ok
      ? accountsResult.error
      : !cardsResult.ok
        ? cardsResult.error
        : "Não foi possível carregar as origens financeiras.";
    return renderShell(
      heading +
        navigation +
        renderEvolutionFilterForm(formValuesFromFilters(filters), [], []) +
        renderState(
          "api-error",
          "Não foi possível carregar contas e cartões",
          `${sourceError} Tente novamente antes de consultar o relatório.`,
        ) +
        renderCategoryEvolutionRuntime(),
    );
  }

  const activeAccounts = accountsResult.data.accounts.filter(
    (account) => account.status === "active",
  );
  const availableCards = cardsResult.data.creditCardAccounts.filter(
    (card) => card.status === "active" || card.status === "blocked",
  );
  const form = renderEvolutionFilterForm(
    formValuesFromFilters(filters),
    activeAccounts,
    availableCards,
  );
  const reportResult = await apiGet<{ report: CategoryEvolutionReport }>(
    token,
    buildEvolutionApiPath(filters),
  );

  if (!reportResult.ok) {
    return renderShell(
      heading +
        navigation +
        form +
        renderState(
          "api-error",
          "Não foi possível carregar o relatório",
          `${reportResult.error} Revise os filtros ou tente novamente.`,
        ) +
        renderCategoryEvolutionRuntime(),
    );
  }

  const report = reportResult.data.report;
  if (report.currencyBlocks.length === 0) {
    return renderShell(
      heading +
        navigation +
        form +
        renderState(
          "empty",
          "Nenhum lançamento realizado no período",
          "Os períodos continuam disponíveis. Ajuste o início, a quantidade, a conta ou o cartão para consultar outro recorte.",
        ) +
        renderEmptyEvolutionMatrix(report) +
        renderCategoryEvolutionRuntime(),
    );
  }

  return renderShell(
    heading +
      navigation +
      form +
      `<div data-report-state="ready" class="currency-report-list">${report.currencyBlocks
        .map((block, blockIndex) => renderCategoryEvolutionAnalysis(report, block, blockIndex))
        .join("")}</div>` +
      renderCategoryEvolutionRuntime(),
  );
}

function renderCategoryEvolutionAnalysis(
  report: CategoryEvolutionReport,
  block: CategoryEvolutionReport["currencyBlocks"][number],
  blockIndex: number,
): string {
  const analysis = buildCategoryEvolutionAnalysisViewModel(report, block);
  return renderReportAnalysisBlock({
    id: `category-analysis-${blockIndex}-${safeId(analysis.currency)}`,
    currency: analysis.currency,
    periodCount: analysis.periodCount,
    summaryItems: [
      {
        label: "Receitas",
        primaryHtml: renderMoney({ amountMinor: analysis.summary.incomeMinor, currency: analysis.currency }),
        tone: "positive",
      },
      {
        label: "Despesas",
        primaryHtml: renderMoney({ amountMinor: analysis.summary.expenseMinor, currency: analysis.currency }),
        tone: "negative",
      },
      {
        label: "Resultado",
        primaryHtml: renderMoney({ amountMinor: analysis.summary.resultMinor, currency: analysis.currency }),
        tone: analysis.summary.resultMinor < 0 ? "negative" : "information",
      },
      {
        label: "Resultado médio",
        primaryHtml: renderMoney({
          amountMinor: analysis.summary.averageResultMinor,
          currency: analysis.currency,
        }),
        tone: "neutral",
      },
    ],
    visualizationTitle: "Resultado ao longo do tempo",
    visualizationHtml: renderResultTrend(
      analysis.trend.map((point) => ({ ...point, currency: analysis.currency })),
    ),
    highlightsHtml: renderAnalysisHighlights({
      currency: analysis.currency,
      best: analysis.highlights.bestPeriod
        ? {
            label: analysis.highlights.bestPeriod.accessibleLabel,
            amountMinor: analysis.highlights.bestPeriod.amountMinor,
          }
        : undefined,
      lowest: analysis.highlights.lowestPeriod
        ? {
            label: analysis.highlights.lowestPeriod.accessibleLabel,
            amountMinor: analysis.highlights.lowestPeriod.amountMinor,
          }
        : undefined,
      negativePeriodCount: analysis.highlights.negativePeriodCount,
    }),
    detailTitle: "Matriz por categoria",
    detailHtml: renderCurrencyMatrix(report, block, blockIndex),
  });
}

function renderEvolutionFilterForm(
  filters: EvolutionFilterFormValues,
  accounts: readonly ReportAccount[],
  cards: readonly ReportCreditCardAccount[],
): string {
  const startInputType = filters.invalid.start
    ? "text"
    : filters.interval === "annual"
      ? "number"
      : "month";
  const startConstraints =
    startInputType === "number" ? ' inputmode="numeric" min="1" max="9999"' : "";
  const startControl = `<input id="report-start" type="${startInputType}"${startConstraints} name="start" value="${escapeHtml(filters.start)}"${filters.invalid.start ? ' aria-invalid="true" data-invalid-filter="start"' : ""} required />`;
  const maxPeriods = INTERVAL_LIMITS[filters.interval].maxPeriods;
  const periodsInputType = filters.invalid.periods ? "text" : "number";
  const periodsConstraints =
    periodsInputType === "number" ? ` inputmode="numeric" min="1" max="${maxPeriods}"` : "";
  const selectedOrigin = filters.accountId
    ? `account:${filters.accountId}`
    : filters.cardId
      ? `card:${filters.cardId}`
      : "";
  const knownSelectedAccount = accounts.some((account) => account.id === filters.accountId);
  const knownSelectedCard = cards.some((card) => card.id === filters.cardId);
  const unavailableAccountOption =
    filters.accountId && !knownSelectedAccount
      ? `<option value="account:${escapeHtml(filters.accountId)}" selected>Conta selecionada indisponível</option>`
      : "";
  const unavailableCardOption =
    filters.cardId && !knownSelectedCard
      ? `<option value="card:${escapeHtml(filters.cardId)}" selected>Cartão selecionado indisponível</option>`
      : "";
  const accountOptions = accounts
    .map(
      (account) =>
        `<option value="account:${escapeHtml(account.id)}"${account.id === filters.accountId ? " selected" : ""}>${escapeHtml(account.name)}</option>`,
    )
    .join("");
  const cardOptions = cards
    .map(
      (card) =>
        `<option value="card:${escapeHtml(card.id)}"${card.id === filters.cardId ? " selected" : ""}>${escapeHtml(card.name)}</option>`,
    )
    .join("");
  const sourceInvalid =
    filters.invalid.accountId || filters.invalid.cardId || filters.invalid.sourceConflict;

  return `
    <section class="panel report-filter-panel" aria-label="Filtros da evolução por categoria">
      <form class="report-filters evolution-filters" method="get" action="/relatorios" data-current-profile-id="${escapeHtml(filters.profileId ?? "")}">
        <input type="hidden" name="view" value="category-evolution" />
        ${filters.profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(filters.profileId)}" />` : ""}
        <input type="hidden" name="interval" value="${escapeHtml(filters.intervalValue)}" />
        <fieldset class="interval-switcher"${filters.invalid.interval ? ' aria-invalid="true"' : ""}>
          <legend>Intervalo</legend>
          ${intervalSwitchLink("monthly", "Mensal", filters)}
          ${intervalSwitchLink("annual", "Anual", filters)}
          ${intervalSwitchLink("rolling-year", "Anual com início móvel", filters)}
          ${filters.invalid.interval ? `<p class="filter-invalid-value" data-invalid-filter="interval">Valor informado: <code>${escapeHtml(filters.intervalValue)}</code></p>` : ""}
        </fieldset>
        <label for="report-origin">Conta ou cartão
          <select id="report-origin" name="origin"${sourceInvalid ? ' aria-invalid="true" data-invalid-filter="origin"' : ""}>
            <option value=""${selectedOrigin ? "" : " selected"}>Todas as contas e cartões</option>
            <optgroup label="Contas">${unavailableAccountOption}${accountOptions}</optgroup>
            <optgroup label="Cartões de crédito">${unavailableCardOption}${cardOptions}</optgroup>
          </select>
        </label>
        <label for="report-start">Início${startControl}</label>
        <label for="report-periods">Período<input id="report-periods" type="${periodsInputType}"${periodsConstraints} name="periods" value="${escapeHtml(filters.periods)}"${filters.invalid.periods ? ' aria-invalid="true" data-invalid-filter="periods"' : ""} required /></label>
        <button type="submit">Carregar</button>
      </form>
      <p class="filter-hint">Todas as contas e cartões mantêm a visão geral. O estado de expansão da árvore reinicia ao aplicar filtros.</p>
    </section>`;
}

function intervalSwitchLink(
  value: ReportInterval,
  label: string,
  filters: EvolutionFilterFormValues,
): string {
  const params = new URLSearchParams({ view: "category-evolution", interval: value });
  if (filters.profileId) params.set("profileId", filters.profileId);
  if (filters.accountId && !filters.invalid.accountId && !filters.invalid.sourceConflict) {
    params.set("accountId", filters.accountId);
  }
  if (filters.cardId && !filters.invalid.cardId && !filters.invalid.sourceConflict) {
    params.set("cardId", filters.cardId);
  }
  return `<a href="/relatorios?${params.toString()}"${
    !filters.invalid.interval && value === filters.interval ? ' aria-current="page"' : ""
  }>${escapeHtml(label)}</a>`;
}

function renderCurrencyMatrix(
  report: CategoryEvolutionReport,
  block: CategoryEvolutionReport["currencyBlocks"][number],
  blockIndex: number,
): string {
  const incomeSectionId = `report-section-${blockIndex}-income`;
  const expenseSectionId = `report-section-${blockIndex}-expense`;
  const incomeBranches = block.incomeCategories.map((node, index) =>
    renderCategoryBranch(node, block.currency, "income", 1, blockIndex, [index], [incomeSectionId]),
  );
  const expenseBranches = block.expenseCategories.map((node, index) =>
    renderCategoryBranch(
      node,
      block.currency,
      "expense",
      1,
      blockIndex,
      [index],
      [expenseSectionId],
    ),
  );
  const incomeRows = incomeBranches.map((branch) => branch.html).join("");
  const expenseRows = expenseBranches.map((branch) => branch.html).join("");
  const incomeRowIds = incomeBranches.flatMap((branch) => branch.rowIds);
  const expenseRowIds = expenseBranches.flatMap((branch) => branch.rowIds);
  const incomeToggle = renderTreeToggle(incomeSectionId, "receitas", incomeRowIds, "income");
  const expenseToggle = renderTreeToggle(expenseSectionId, "despesas", expenseRowIds, "expense");

  return `<div class="evolution-block">
      <div class="evolution-table-scroll" tabindex="0" aria-label="Matriz de evolução em ${escapeHtml(block.currency)}">
        <table class="evolution-table" data-category-tree="${blockIndex}">
          <thead><tr><th scope="col" class="sticky-description">Descrição</th>${report.periods
            .map(renderPeriodHeader)
            .join("")}<th scope="col">Média</th><th scope="col">Total</th></tr></thead>
          <tbody>
            ${renderSeriesRow("Receitas", block.income, block.currency, "income", 0, false, {
              rowId: incomeSectionId,
              ancestorRowIds: [],
              toggle: incomeToggle,
            })}
            ${incomeRows}
            ${renderSeriesRow("Despesas", block.expense, block.currency, "expense", 0, false, {
              rowId: expenseSectionId,
              ancestorRowIds: [],
              toggle: expenseToggle,
            })}
            ${expenseRows}
            ${renderSeriesRow("Resultado", block.result, block.currency, "result", 0)}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderPeriodHeader(period: CategoryEvolutionReport["periods"][number]): string {
  return `<th scope="col"><span aria-hidden="true">${escapeHtml(period.label)}</span><span class="sr-only">${escapeHtml(period.accessibleLabel)}</span></th>`;
}

function renderEmptyEvolutionMatrix(report: CategoryEvolutionReport): string {
  return `
    <section class="panel evolution-block" aria-label="Matriz sem movimentos e sem moeda definida">
      <p class="sr-only">Não há moeda associada a movimentos neste período.</p>
      <div class="evolution-table-scroll" tabindex="0" aria-label="Matriz de evolução sem movimentos">
        <table class="evolution-table"><thead><tr><th scope="col" class="sticky-description">Descrição</th>${report.periods.map(renderPeriodHeader).join("")}<th scope="col">Média</th><th scope="col">Total</th></tr></thead>
        <tbody>${renderNeutralSeriesRow("Receitas", report.periodCount, "income")}${renderNeutralSeriesRow("Despesas", report.periodCount, "expense")}${renderNeutralSeriesRow("Resultado", report.periodCount, "result")}</tbody></table>
      </div>
    </section>`;
}

function renderNeutralSeriesRow(
  label: string,
  periodCount: number,
  kind: "income" | "expense" | "result",
): string {
  const cells = Array.from({ length: periodCount + 2 }, () => renderNeutralValueCell()).join("");
  return `<tr class="report-row report-row-${kind} report-section-row">
    <th scope="row" class="sticky-description" style="--report-depth:0"><span>${escapeHtml(label)}</span></th>
    ${cells}
  </tr>`;
}

function renderNeutralValueCell(): string {
  return "<td><strong>0</strong><span>—</span></td>";
}

function renderCategoryBranch(
  node: ReportCategoryNode,
  currency: string,
  kind: "income" | "expense",
  depth: number,
  blockIndex: number,
  path: readonly number[],
  ancestorRowIds: readonly string[],
): RenderedCategoryBranch {
  const rowId = `report-category-${blockIndex}-${kind}-${path.join("-")}`;
  const childBranches = node.children.map((child, index) =>
    renderCategoryBranch(
      child,
      currency,
      kind,
      depth + 1,
      blockIndex,
      [...path, index],
      [...ancestorRowIds, rowId],
    ),
  );
  const descendantIds = childBranches.flatMap((branch) => branch.rowIds);
  const toggle = renderTreeToggle(rowId, node.name, descendantIds);
  const row = renderSeriesRow(
    node.name,
    node.series,
    currency,
    kind,
    depth,
    node.status === "archived",
    {
      rowId,
      ancestorRowIds,
      toggle,
    },
  );

  return {
    html: row + childBranches.map((branch) => branch.html).join(""),
    rowIds: [rowId, ...descendantIds],
  };
}

function renderTreeToggle(
  rowId: string,
  label: string,
  descendantIds: readonly string[],
  section?: "income" | "expense",
): string {
  if (descendantIds.length === 0) {
    return '<span class="category-tree-spacer" aria-hidden="true"></span>';
  }

  return `<button class="category-tree-toggle" type="button" data-category-toggle="${rowId}" data-category-name="${escapeHtml(label)}"${section ? ` data-section-toggle="${section}"` : ""} aria-expanded="true" aria-controls="${descendantIds.join(" ")}"><span aria-hidden="true" data-category-toggle-icon>−</span><span class="sr-only" data-category-toggle-label>Recolher ${escapeHtml(label)}</span></button>`;
}

function renderSeriesRow(
  label: string,
  series: ReportSeries,
  currency: string,
  kind: "income" | "expense" | "result",
  depth: number,
  archived = false,
  tree?: { rowId: string; ancestorRowIds: readonly string[]; toggle: string },
): string {
  const treeAttributes = tree
    ? ` id="${tree.rowId}" data-category-row="${tree.rowId}" data-tree-ancestors="${tree.ancestorRowIds.join(" ")}"`
    : "";
  const labelContent = tree
    ? `<span class="report-category-label">${tree.toggle}<span>${escapeHtml(label)}</span></span>`
    : `<span>${escapeHtml(label)}</span>`;
  return `<tr class="report-row report-row-${kind}${depth === 0 ? " report-section-row" : ""}"${treeAttributes}>
    <th scope="row" class="sticky-description" style="--report-depth:${depth}">${labelContent}${archived ? "<small>Arquivada</small>" : ""}</th>
    ${series.cells.map((cell) => renderValueCell(cell.amountMinor, cell.percentage, currency, kind)).join("")}
    ${renderValueCell(series.averageMinor, series.averagePercentage, currency, kind)}
    ${renderValueCell(series.totalMinor, series.totalPercentage, currency, kind)}
  </tr>`;
}

function renderValueCell(
  amountMinor: number,
  percentage: number | null,
  currency: string,
  kind: "income" | "expense" | "result",
): string {
  const presentedAmount = kind === "expense" ? -Math.abs(amountMinor) : amountMinor;
  const normalized = Object.is(presentedAmount, -0) ? 0 : presentedAmount;
  const negativeResult = kind === "result" && normalized < 0;
  return `<td${negativeResult ? ' class="report-value-negative" data-negative-value="true"' : ""}><strong>${renderMoney({ amountMinor: normalized, currency })}</strong><span>${percentage === null ? "—" : `${formatPercentage(percentage)}%`}</span></td>`;
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function readEvolutionFilters(url: URL, referenceDate: Date): EvolutionFilters {
  const draft = readEvolutionFilterDraft(url, referenceDate);
  const requestedInterval = url.searchParams.get("interval");
  if (requestedInterval !== null && !isInterval(requestedInterval)) {
    throw new Error("Intervalo inválido. Escolha mensal, anual ou anual com início móvel.");
  }
  if (draft.invalid.sourceConflict) {
    throw new Error("Filtro inválido. Selecione somente uma conta ou um cartão de crédito.");
  }
  if (draft.invalid.accountId) {
    throw new Error("Conta inválida. Selecione uma conta disponível ou Todas as contas e cartões.");
  }
  if (draft.invalid.cardId) {
    throw new Error(
      "Cartão inválido. Selecione um cartão disponível ou Todas as contas e cartões.",
    );
  }

  const rawPeriods = draft.periods;
  if (!/^\d+$/.test(rawPeriods)) {
    throw new Error("Período inválido. Informe uma quantidade inteira de colunas.");
  }
  const periods = Number(rawPeriods);
  const max = INTERVAL_LIMITS[draft.interval].maxPeriods;
  if (periods < 1 || periods > max) {
    throw new Error(`Período inválido. Informe entre 1 e ${max}.`);
  }

  validateEvolutionStart(draft.interval, draft.start);
  validateEvolutionEnd(draft.interval, draft.start, periods);
  return {
    interval: draft.interval,
    start: draft.start,
    periods,
    ...(draft.profileId ? { profileId: draft.profileId } : {}),
    ...(draft.accountId ? { accountId: draft.accountId.toLowerCase() } : {}),
    ...(draft.cardId ? { cardId: draft.cardId.toLowerCase() } : {}),
  };
}

function readEvolutionFilterDraft(url: URL, referenceDate: Date): EvolutionFilterFormValues {
  const requestedInterval = url.searchParams.get("interval");
  const interval = isInterval(requestedInterval) ? requestedInterval : "monthly";
  const requestedPeriods = url.searchParams.get("periods");
  const maxPeriods = INTERVAL_LIMITS[interval].maxPeriods;
  const validRequestedPeriods =
    requestedPeriods !== null &&
    /^\d+$/.test(requestedPeriods) &&
    Number(requestedPeriods) >= 1 &&
    Number(requestedPeriods) <= maxPeriods;
  const periodsForDefault = validRequestedPeriods
    ? Number(requestedPeriods)
    : INTERVAL_LIMITS[interval].defaultPeriods;
  const periods = requestedPeriods ?? String(periodsForDefault);
  const requestedStart = url.searchParams.get("start");
  const start = requestedStart ?? deriveEvolutionStart(interval, periodsForDefault, referenceDate);
  const profileId = nonEmpty(url.searchParams.get("profileId"));
  const requestedAccountId = url.searchParams.get("accountId");
  const requestedCardId = url.searchParams.get("cardId");
  const accountId = nonEmpty(requestedAccountId) ?? "";
  const cardId = nonEmpty(requestedCardId) ?? "";
  const invalidStart =
    requestedStart !== null &&
    (!isEvolutionStartValid(interval, requestedStart) ||
      (validRequestedPeriods &&
        !isEvolutionEndRepresentable(interval, requestedStart, periodsForDefault)));

  return {
    interval,
    intervalValue: requestedInterval ?? interval,
    start,
    periods,
    ...(profileId ? { profileId } : {}),
    accountId,
    cardId,
    invalid: {
      interval: requestedInterval !== null && !isInterval(requestedInterval),
      start: invalidStart,
      periods: requestedPeriods !== null && !validRequestedPeriods,
      accountId: accountId !== "" && !UUID_PATTERN.test(accountId),
      cardId: cardId !== "" && !UUID_PATTERN.test(cardId),
      sourceConflict: requestedAccountId !== null && requestedCardId !== null,
    },
  };
}

function formValuesFromFilters(filters: EvolutionFilters): EvolutionFilterFormValues {
  return {
    interval: filters.interval,
    intervalValue: filters.interval,
    start: filters.start,
    periods: String(filters.periods),
    ...(filters.profileId ? { profileId: filters.profileId } : {}),
    accountId: filters.accountId ?? "",
    cardId: filters.cardId ?? "",
    invalid: {
      interval: false,
      start: false,
      periods: false,
      accountId: false,
      cardId: false,
      sourceConflict: false,
    },
  };
}

function isEvolutionStartValid(interval: ReportInterval, start: string): boolean {
  if (interval === "annual") return /^\d{4}$/.test(start) && Number(start) >= 1;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(start) && Number(start.slice(0, 4)) >= 1;
}

function validateEvolutionStart(interval: ReportInterval, start: string): void {
  if (isEvolutionStartValid(interval, start)) return;
  if (interval === "annual") {
    throw new Error("Início inválido. Informe um ano no formato AAAA.");
  }
  throw new Error("Início inválido. Informe um mês no formato AAAA-MM.");
}

function isEvolutionEndRepresentable(
  interval: ReportInterval,
  start: string,
  periods: number,
): boolean {
  if (!isEvolutionStartValid(interval, start)) return false;
  if (interval === "annual") return Number(start) + periods - 1 <= 9999;
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  const offset = interval === "monthly" ? periods - 1 : periods * 12 - 1;
  return addMonths(year, month, offset).year <= 9999;
}

function validateEvolutionEnd(interval: ReportInterval, start: string, periods: number): void {
  if (!isEvolutionEndRepresentable(interval, start, periods)) {
    throw new Error("O período calculado ultrapassa o ano 9999.");
  }
}

function deriveEvolutionStart(
  interval: ReportInterval,
  periods: number,
  referenceDate: Date,
): string {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  if (interval === "annual") return String(year - periods + 1).padStart(4, "0");
  const offset = interval === "monthly" ? -(periods - 1) : -(periods * 12 - 1);
  const result = addMonths(year, month, offset);
  return `${String(result.year).padStart(4, "0")}-${String(result.month).padStart(2, "0")}`;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const absolute = year * 12 + month - 1 + offset;
  return { year: Math.floor(absolute / 12), month: (((absolute % 12) + 12) % 12) + 1 };
}

function buildAccountsApiPath(profileId: string | undefined): string {
  const params = new URLSearchParams({ status: "active" });
  if (profileId) params.set("profileId", profileId);
  return `/api/accounts?${params.toString()}`;
}

function buildCreditCardAccountsApiPath(profileId: string | undefined): string {
  const params = new URLSearchParams({ status: "all" });
  if (profileId) params.set("profileId", profileId);
  return `/api/credit-card-accounts?${params.toString()}`;
}

function buildEvolutionApiPath(filters: EvolutionFilters): string {
  return `/api/reports/category-evolution?${new URLSearchParams({
    interval: filters.interval,
    start: filters.start,
    periods: String(filters.periods),
    ...(filters.profileId ? { profileId: filters.profileId } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.cardId ? { cardId: filters.cardId } : {}),
  }).toString()}`;
}

function isInterval(value: string | null): value is ReportInterval {
  return value === "monthly" || value === "annual" || value === "rolling-year";
}

function nonEmpty(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
