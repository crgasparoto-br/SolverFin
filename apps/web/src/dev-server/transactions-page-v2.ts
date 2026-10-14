import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { attachmentWorkspaceScript, renderAttachmentWorkspace } from "./attachment-workspace.js";
import { findInstitution, renderInstitutionIcon } from "./institutions.js";
import {
  recurrencesSectionScript,
  recurrencesSectionStyles,
  renderRecurrenceActionMenuItems,
  renderRecurrenceEditModal,
  renderRecurrenceIndicator,
  type RecurrenceRecord,
} from "./recurrences-section.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";
import {
  renderStatementListArchetype,
  statementListArchetypeStyles,
} from "./statement-list-archetype.js";
import { renderStatementStatus } from "./statement-status.js";
import { buildConsolidatedStatement } from "./transactions-consolidated.js";
import {
  buildRows,
  buildTransactionQuery,
  calculateOpeningBalance,
  filterStatementPeriodTransactions,
  isAccountStatementTransaction,
  monthToPeriod,
  projectTransactionGroups,
  resolveFilters,
  statementDate,
  summarize,
  type AccountRecord,
  type StatementRow,
  type StatementSummary,
  type TransactionGroupRecord,
  type TransactionRecord,
} from "./transactions-statement.js";

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

type StatementSort =
  | "date_asc"
  | "date_desc"
  | "amount_desc"
  | "amount_asc"
  | "description_asc"
  | "description_desc";

interface StatementPresentation {
  search: string;
  sort: StatementSort;
  insightCategoryId?: string;
  insightMerchantKey?: string;
  filterKind?: "income" | "expense" | "transfer";
  filterReconciliation?: "reconciled" | "unreconciled";
  filterStatus?: "effective" | "suggested" | "planned";
}

export async function renderTransactionsPageV2(token: string, url?: URL): Promise<string> {
  const [accountsResult, categoriesResult] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

  if (!accountsResult.ok) return renderErrorPage(accountsResult.error);

  const accounts = accountsResult.data.accounts.filter((account) => account.status === "active");
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];
  const consolidated = url?.searchParams.get("accountId") === "all";
  const availableCurrencies = [
    ...new Set(
      accounts
        .map((account) => normalizeCurrency(account.currency))
        .filter((code): code is string => Boolean(code)),
    ),
  ].sort();
  const requestedCurrency = normalizeCurrency(url?.searchParams.get("currency") ?? undefined);
  const consolidatedCurrency =
    requestedCurrency && availableCurrencies.includes(requestedCurrency)
      ? requestedCurrency
      : availableCurrencies.includes("BRL")
        ? "BRL"
        : availableCurrencies[0];
  const baseFilters = resolveFilters(url, accounts);
  const { accountId: _individualId, currency: _individualCurrency, ...sharedFilters } = baseFilters;
  const filters = consolidated
    ? { ...sharedFilters, ...(consolidatedCurrency ? { currency: consolidatedCurrency } : {}) }
    : baseFilters;
  const selectedAccount = consolidated
    ? undefined
    : accounts.find((account) => account.id === filters.accountId);
  const currency = consolidated ? consolidatedCurrency : resolveAccountCurrency(selectedAccount);
  const presentation = resolvePresentation(url);

  // Recurrences are fetched first because the API materializes due occurrences as transactions.
  const recurrenceAccounts =
    consolidated && currency
      ? accounts.filter((account) => normalizeCurrency(account.currency) === currency)
      : selectedAccount
        ? [selectedAccount]
        : [];
  const recurrenceResults = await Promise.all(
    recurrenceAccounts.map((account) =>
      apiGet<{ recurrences: RecurrenceRecord[] }>(
        token,
        `/api/recurrences?accountId=${encodeURIComponent(account.id)}&status=all`,
      ),
    ),
  );
  const recurrences = recurrenceResults.flatMap((result) =>
    result.ok ? result.data.recurrences : [],
  );

  const [transactionResult, groupsResult] =
    filters.accountId || (consolidated && currency)
      ? await Promise.all([
          apiGet<{ transactions: TransactionRecord[] }>(
            token,
            `/api/transactions?${buildTransactionQuery(filters)}`,
          ),
          consolidated
            ? Promise.resolve({
                ok: true as const,
                data: { groups: [] as TransactionGroupRecord[] },
              })
            : apiGet<{ groups: TransactionGroupRecord[] }>(
                token,
                `/api/transaction-groups?accountId=${encodeURIComponent(filters.accountId ?? "")}&startsOn=1900-01-01&endsOn=${filters.endsOn}`,
              ),
        ])
      : ([
          { ok: true, data: { transactions: [] as TransactionRecord[] } },
          { ok: true, data: { groups: [] as TransactionGroupRecord[] } },
        ] as const);

  if (!transactionResult.ok) return renderErrorPage(transactionResult.error);

  const groups =
    groupsResult.ok && Array.isArray(groupsResult.data?.groups) ? groupsResult.data.groups : [];
  const transactions = projectTransactionGroups(
    transactionResult.data.transactions.filter(isAccountStatementTransaction),
    groups,
  );
  const consolidatedStatement =
    consolidated && currency
      ? buildConsolidatedStatement(accounts, transactions, currency, filters)
      : undefined;
  const openingMinor = consolidatedStatement
    ? consolidatedStatement.summary.openingMinor
    : calculateOpeningBalance(transactions, selectedAccount, filters.startsOn);
  const canonicalRows =
    consolidatedStatement?.rows ??
    buildRows(
      filterStatementPeriodTransactions(transactions, filters),
      selectedAccount,
      openingMinor,
    );
  const summary = consolidatedStatement?.summary ?? summarize(canonicalRows, openingMinor);
  const visibleRows = sortRows(
    filterRowsForPresentation(canonicalRows, categories, presentation),
    presentation.sort,
  );

  const actionsHtml = renderQuickActions(selectedAccount);
  const filtersHtml = renderFilters(
    accounts,
    selectedAccount,
    consolidated ? "all" : filters.accountId,
    filters.month,
    presentation,
    url,
    categories,
    consolidated ? currency : undefined,
    availableCurrencies,
  );
  const contextHtml = renderStatementContext(
    selectedAccount,
    currency,
    filters.startsOn,
    filters.endsOn,
    consolidated,
    consolidatedStatement?.accountCount ?? 0,
  );
  const statusHtml = renderInsightContext(presentation);
  const summaryHtml = renderSummaryPanel(
    summary,
    selectedAccount,
    currency,
    consolidated,
    consolidatedStatement?.accountCount ?? 0,
  );
  const listHtml = renderStatementList(
    visibleRows,
    selectedAccount,
    accounts,
    categories,
    recurrences,
    summary,
    currency,
    presentation.sort,
    consolidated,
    filters.month,
  );

  const content = renderStatementListArchetype({
    actionsHtml,
    filtersHtml,
    contextHtml,
    ...(statusHtml ? { statusHtml } : {}),
    summaryHtml,
    listHtml,
  });

  return renderShell(`
    ${content}
    ${renderModal(selectedAccount, accounts, categories, currency)}
    ${renderGroupModal(selectedAccount, currency)}
    ${renderRecurrenceEditModal(categories, "account", "", currency ?? "moeda indisponível")}
    ${clientScript(currency, accounts)}
    ${attachmentWorkspaceScript()}
    ${recurrencesSectionScript()}
  `);
}

function resolvePresentation(url: URL | undefined): StatementPresentation {
  const rawSort = url?.searchParams.get("sort");
  const sort: StatementSort = isStatementSort(rawSort) ? rawSort : "date_asc";
  const insightCategoryId = readNonEmpty(url?.searchParams.get("categoryId"));
  const insightMerchantKey = normalizeMerchantKey(url?.searchParams.get("merchantKey") ?? "");
  const kind = url?.searchParams.get("kind");
  const reconciliation = url?.searchParams.get("reconciliation");
  const status = url?.searchParams.get("status");
  return {
    search: (url?.searchParams.get("q") ?? "").trim().slice(0, 120),
    sort,
    ...(insightCategoryId ? { insightCategoryId } : {}),
    ...(insightMerchantKey ? { insightMerchantKey } : {}),
    ...(kind === "expense" || kind === "income" || kind === "transfer" ? { filterKind: kind } : {}),
    ...(reconciliation === "unreconciled" || reconciliation === "reconciled"
      ? { filterReconciliation: reconciliation }
      : {}),
    ...(status === "effective" || status === "suggested" || status === "planned"
      ? { filterStatus: status }
      : {}),
  };
}

function filterRowsForPresentation(
  rows: readonly StatementRow[],
  categories: readonly CategoryRecord[],
  presentation: StatementPresentation,
): StatementRow[] {
  const search = normalizeSearch(presentation.search);
  return rows.filter((row) => {
    const transaction = row.transaction;
    if (presentation.filterKind && transaction.kind !== presentation.filterKind) return false;
    if (presentation.filterReconciliation === "reconciled" && transaction.status !== "reconciled")
      return false;
    if (presentation.filterReconciliation === "unreconciled" && transaction.status === "reconciled")
      return false;
    if (presentation.filterStatus === "effective" && transaction.effectiveOn === undefined)
      return false;
    if (
      presentation.filterStatus === "suggested" &&
      (transaction.effectiveOn !== undefined || transaction.status !== "suggested")
    )
      return false;
    if (
      presentation.filterStatus === "planned" &&
      (transaction.effectiveOn !== undefined || transaction.status === "suggested")
    )
      return false;
    if (
      presentation.insightCategoryId &&
      transaction.categoryId !== presentation.insightCategoryId
    ) {
      return false;
    }
    if (
      presentation.insightMerchantKey &&
      normalizeMerchantKey(transaction.description ?? "") !== presentation.insightMerchantKey
    ) {
      return false;
    }
    if ((presentation.insightCategoryId || presentation.insightMerchantKey) && transaction.group) {
      return false;
    }
    if (!search) return true;
    const category = transaction.categoryId
      ? (categories.find((candidate) => candidate.id === transaction.categoryId)?.name ?? "")
      : "";
    return normalizeSearch(
      `${transaction.description} ${category} ${transaction.kind} ${transaction.status}`,
    ).includes(search);
  });
}

function sortRows(rows: readonly StatementRow[], sort: StatementSort): StatementRow[] {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    if (sort === "date_desc")
      return statementDate(right.transaction).localeCompare(statementDate(left.transaction));
    if (sort === "amount_desc") return Math.abs(right.amountMinor) - Math.abs(left.amountMinor);
    if (sort === "amount_asc") return Math.abs(left.amountMinor) - Math.abs(right.amountMinor);
    if (sort === "description_desc")
      return right.transaction.description.localeCompare(left.transaction.description, "pt-BR", {
        sensitivity: "base",
      });
    if (sort === "description_asc")
      return left.transaction.description.localeCompare(right.transaction.description, "pt-BR", {
        sensitivity: "base",
      });
    return statementDate(left.transaction).localeCompare(statementDate(right.transaction));
  });
  return sorted;
}

function renderQuickActions(selectedAccount: AccountRecord | undefined): string {
  const disabled = selectedAccount ? "" : " disabled";
  return `<div class="statement-heading-actions" aria-label="Ações rápidas">
    <button type="button" data-open-modal data-quick-kind="transfer"${disabled}>Transferir</button>
    <button type="button" data-open-modal data-quick-kind="expense"${disabled}>Nova despesa</button>
    <button type="button" data-open-modal data-quick-kind="income"${disabled}>Nova receita</button>
  </div>`;
}

function renderFilters(
  accounts: readonly AccountRecord[],
  selectedAccount: AccountRecord | undefined,
  selectedId: string | undefined,
  month: string,
  presentation: StatementPresentation,
  url: URL | undefined,
  categories: readonly CategoryRecord[],
  consolidatedCurrency?: string,
  availableCurrencies: readonly string[] = [],
): string {
  const preserved = [
    "profileId",
    ...(consolidatedCurrency ? [] : ["currency"]),
    "evidence",
    "day",
    "from",
    "to",
    "merchantKey",
  ]
    .map((name) => {
      const value = url?.searchParams.get(name);
      return value ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : "";
    })
    .join("");

  const day = url?.searchParams.get("day");
  const activePeriod =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { startsOn: day, endsOn: day } : monthToPeriod(month);
  const shortcutBase = new URLSearchParams();
  if (selectedId) shortcutBase.set("accountId", selectedId);
  if (consolidatedCurrency) shortcutBase.set("currency", consolidatedCurrency);
  if (presentation.search) shortcutBase.set("q", presentation.search);
  if (presentation.filterKind) shortcutBase.set("kind", presentation.filterKind);
  if (presentation.filterStatus) shortcutBase.set("status", presentation.filterStatus);
  if (presentation.filterReconciliation)
    shortcutBase.set("reconciliation", presentation.filterReconciliation);
  if (presentation.insightCategoryId)
    shortcutBase.set("categoryId", presentation.insightCategoryId);
  if (presentation.sort !== "date_asc") shortcutBase.set("sort", presentation.sort);
  const shortcut = (
    key: string,
    label: string,
    params: Readonly<Record<string, string>>,
    active: boolean,
  ): string => {
    const query = new URLSearchParams(shortcutBase);
    query.set("month", params.month ?? month);
    for (const [key, value] of Object.entries(params)) {
      if (key !== "month") query.set(key, value);
    }
    return `<a class="statement-period-chip" data-period-shortcut="${key}" href="/lancamentos?${query.toString()}"${active ? ' aria-current="true"' : ""}>${label}</a>`;
  };
  const dayOffset = (count: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - count);
    return date.toISOString().slice(0, 10);
  };
  const todayIso = dayOffset(0);
  const previousMonth = (() => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 7);
  })();
  const periodShortcuts = [
    shortcut("today", "Hoje", { day: todayIso }, day === todayIso),
    shortcut("last7", "7 dias", { from: dayOffset(6), to: todayIso }, false),
    shortcut("last30", "30 dias", { from: dayOffset(29), to: todayIso }, false),
    shortcut(
      "thisMonth",
      "Este mês",
      { month: todayIso.slice(0, 7) },
      month === todayIso.slice(0, 7) && !day,
    ),
    shortcut(
      "previousMonth",
      "Mês anterior",
      { month: previousMonth },
      month === previousMonth && !day,
    ),
  ].join("");
  const activeFilterCount = [
    presentation.search,
    presentation.filterKind,
    presentation.filterStatus,
    presentation.filterReconciliation,
    presentation.insightCategoryId,
    day,
    presentation.sort !== "date_asc" ? presentation.sort : undefined,
  ].filter(Boolean).length;

  return `<form class="filter-form" method="get" action="/lancamentos" data-auto-submit>
    ${preserved}
    ${renderAccountPicker(accounts, selectedAccount, selectedId, consolidatedCurrency, availableCurrencies)}
    <div class="month-field">
      <label for="filter-month">Mês</label>
      <div class="month-nav">
        <button type="button" class="icon-btn" data-month-step="-1" aria-label="Mês anterior">&#8249;</button>
        <input id="filter-month" name="month" type="month" lang="pt-BR" value="${escapeHtml(month)}" required />
        <button type="button" class="icon-btn" data-month-step="1" aria-label="Próximo mês">&#8250;</button>
      </div>
    </div>
    <div class="statement-period-shortcuts" role="group" aria-label="Atalhos de período"><span class="statement-period-range" data-period-range>Período ${formatDate(activePeriod.startsOn)} – ${formatDate(activePeriod.endsOn)}</span>${periodShortcuts}<span class="statement-filter-count" data-filter-count>Filtros (${activeFilterCount})</span></div>
    <label class="statement-search-field" for="statement-search">Buscar
      <input id="statement-search" name="q" type="search" value="${escapeHtml(presentation.search)}" placeholder="Descrição ou categoria" autocomplete="off" />
    </label>
    <label class="statement-kind-field" for="statement-kind"><span class="filter-field-heading">${filterIcon("kind")}Tipo</span>
      <select id="statement-kind" name="kind">
        <option value="">Todos os tipos</option>
        <option value="expense"${presentation.filterKind === "expense" ? " selected" : ""}>Despesa</option>
        <option value="income"${presentation.filterKind === "income" ? " selected" : ""}>Receita</option>
        <option value="transfer"${presentation.filterKind === "transfer" ? " selected" : ""}>Transferência</option>
      </select>
    </label>
    <label class="statement-status-field" for="statement-status"><span class="filter-field-heading">${filterIcon("status")}Status</span>
      <select id="statement-status" name="status">
        <option value="">Todos os status</option>
        <option value="effective"${presentation.filterStatus === "effective" ? " selected" : ""}>Efetivado</option>
        <option value="suggested"${presentation.filterStatus === "suggested" ? " selected" : ""}>Pendente</option>
        <option value="planned"${presentation.filterStatus === "planned" ? " selected" : ""}>Previsto</option>
      </select>
    </label>
    <label class="statement-reconciliation-field" for="statement-reconciliation"><span class="filter-field-heading">${filterIcon("reconciliation")}Conciliação</span>
      <select id="statement-reconciliation" name="reconciliation">
        <option value="">Todas as situações</option>
        <option value="unreconciled"${presentation.filterReconciliation === "unreconciled" ? " selected" : ""}>Não conciliado</option>
        <option value="reconciled"${presentation.filterReconciliation === "reconciled" ? " selected" : ""}>Conciliado</option>
      </select>
    </label>
    <label class="statement-category-field" for="statement-category"><span class="filter-field-heading">${filterIcon("category")}Categoria</span>
      <select id="statement-category" name="categoryId" aria-label="Filtrar por categoria">
        <option value="">Todas</option>
        ${renderCategoryOptions(categories, presentation.insightCategoryId)}
      </select>
    </label>
    <label class="statement-sort-field" for="statement-sort"><span class="filter-field-heading">${filterIcon("sort")}Ordenar</span>
      <select id="statement-sort" name="sort">${renderSortOptions(presentation.sort)}</select>
    </label>
    <div class="statement-filter-actions">
      <button type="submit">Aplicar</button>
      <button type="button" class="ghost-btn" data-month-current>Mês atual</button>
      <a class="button-link secondary-button" href="/lancamentos${selectedId ? `?accountId=${encodeURIComponent(selectedId)}&month=${encodeURIComponent(month)}${consolidatedCurrency ? `&currency=${encodeURIComponent(consolidatedCurrency)}` : ""}` : ""}">Limpar filtros</a>
    </div>
  </form>`;
}

function renderSortOptions(selected: StatementSort): string {
  const options: Array<[StatementSort, string]> = [
    ["date_asc", "Data: mais antiga"],
    ["date_desc", "Data: mais recente"],
    ["amount_desc", "Valor: maior primeiro"],
    ["amount_asc", "Valor: menor primeiro"],
    ["description_asc", "Descrição: A–Z"],
    ["description_desc", "Descrição: Z–A"],
  ];
  return options
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

function renderStatementContext(
  selectedAccount: AccountRecord | undefined,
  currency: string | undefined,
  startsOn: string,
  endsOn: string,
  consolidated = false,
  accountCount = 0,
): string {
  if (consolidated) {
    return `<section class="statement-context" aria-label="Contexto consolidado"><div class="statement-context-main"><span class="account-select-icon" aria-hidden="true">▦</span><div class="statement-context-copy"><span class="muted">Visão consolidada</span><strong>Todas as contas</strong><span class="statement-institution-name">${accountCount} contas em ${escapeHtml(currency ?? "moeda indisponível")}</span></div></div><div class="statement-context-meta"><span class="statement-context-pill" data-context="currency">${escapeHtml(currency ?? "Moeda indisponível")}</span><span class="statement-context-pill" data-context="period">${formatDate(startsOn)} até ${formatDate(endsOn)}</span></div></section>`;
  }
  if (!selectedAccount) {
    return `<section class="statement-context" role="status"><div class="statement-context-copy"><strong>Selecione uma conta</strong><span class="muted">O extrato, os saldos e os lançamentos são sempre apresentados no contexto de uma conta.</span></div></section>`;
  }
  const institution = findInstitution(selectedAccount.institutionKey);
  return `<section class="statement-context" aria-label="Contexto financeiro atual">
    <div class="statement-context-main">
      <span class="account-select-icon">${renderInstitutionIcon(institution.key)}</span>
      <div class="statement-context-copy"><span class="muted">Conta atual</span><strong>${escapeHtml(selectedAccount.name)}</strong><span class="statement-institution-name">${escapeHtml(institution.label)}</span></div>
    </div>
    <div class="statement-context-meta">
      <span class="statement-context-pill" data-context="currency">${escapeHtml(currency ?? "Moeda indisponível")}</span>
      <span class="statement-context-pill" data-context="period">${formatDate(startsOn)} até ${formatDate(endsOn)}</span>
    </div>
  </section>`;
}

function renderInsightContext(presentation: StatementPresentation): string {
  if (!presentation.insightCategoryId && !presentation.insightMerchantKey) return "";
  const filters = [
    presentation.insightCategoryId ? "a categoria indicada pelo insight" : undefined,
    presentation.insightMerchantKey
      ? `o estabelecimento ${presentation.insightMerchantKey}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  return `<p class="statement-insight-context" data-insight-context role="status"><strong>Filtro do insight ativo:</strong> mostrando lançamentos compatíveis com ${escapeHtml(filters.join(" e "))}. O resumo da conta permanece completo.</p>`;
}

function renderStatementList(
  rows: readonly StatementRow[],
  selectedAccount: AccountRecord | undefined,
  accounts: readonly AccountRecord[],
  categories: readonly CategoryRecord[],
  recurrences: readonly RecurrenceRecord[],
  summary: StatementSummary,
  currency: string | undefined,
  sort: StatementSort,
  consolidated = false,
  month = "",
): string {
  const body =
    rows.length > 0
      ? renderRowsWithTemporalGroups(
          rows,
          selectedAccount,
          accounts,
          categories,
          recurrences,
          currency,
          sort,
          consolidated,
          month,
        )
      : emptyState(
          selectedAccount || consolidated
            ? "Nenhum lançamento neste recorte."
            : "Selecione uma conta.",
          selectedAccount
            ? "Altere o período ou os filtros, ou crie um lançamento para acompanhar a movimentação."
            : consolidated
              ? "Nenhum lançamento encontrado para as contas desta moeda no período."
              : "O extrato é sempre exibido por conta bancária.",
        );
  return `<section class="panel statement-panel" aria-labelledby="statement-list-title">
    <div class="statement-toolbar">
      <div><p class="eyebrow">Movimentações</p><h2 id="statement-list-title">${selectedAccount ? `Extrato de ${escapeHtml(selectedAccount.name)}` : "Extrato"}</h2></div>
      <div class="chips">${chip("Pendentes", summary.pendingCount, "pending")}${chip("Não conciliados", summary.unreconciledCount, "posted")}${chip("Conciliados", summary.reconciledCount, "ok")}</div>
    </div>
    <div class="statement-table" role="table" aria-label="Extrato bancário">
      ${renderTableHeader()}
      ${body}
    </div>
    <aside class="selection-bar" data-selection-bar hidden aria-live="polite">
      <strong><span data-selection-count>0</span> selecionados</strong>
      <span data-selection-total>${currency ? formatMoney(0, currency) : "Moeda indisponível"}</span>
      <button type="button" class="ghost-btn" data-selection-clear>Limpar</button>
      <button type="button" data-group-open disabled>Unificar lançamentos</button>
    </aside>
  </section>`;
}

function renderRowsWithTemporalGroups(
  rows: readonly StatementRow[],
  selectedAccount: AccountRecord | undefined,
  accounts: readonly AccountRecord[],
  categories: readonly CategoryRecord[],
  recurrences: readonly RecurrenceRecord[],
  currency: string | undefined,
  sort: StatementSort,
  consolidated = false,
  month = "",
): string {
  const groupByDate = sort === "date_asc" || sort === "date_desc";
  let previousDate = "";
  return rows
    .map((row) => {
      const date = statementDate(row.transaction);
      const separator =
        groupByDate && date !== previousDate
          ? `<div class="statement-date-group" data-statement-date-group="${escapeHtml(date)}"><span>${formatDate(date)}</span><span>${escapeHtml(resolveEvidenceLabel(row.transaction))}</span></div>`
          : "";
      previousDate = date;
      return `${separator}${renderRow(row, selectedAccount, accounts, categories, recurrences, currency, consolidated, month)}`;
    })
    .join("");
}

function renderTableHeader(): string {
  return `<div class="statement-row statement-head" role="row"><span class="col-select" aria-hidden="true"></span><span class="col-row-icon" aria-hidden="true"></span><span class="col-date">Data</span><span class="col-description">Descrição</span><span class="col-category">Categoria</span><span class="col-kind">Tipo</span><span class="col-status">Status</span><span class="col-amount">Valor</span><span class="col-balance">Saldo</span><span class="col-actions">Ações</span></div>`;
}

function renderRow(
  row: StatementRow,
  selectedAccount: AccountRecord | undefined,
  accounts: readonly AccountRecord[],
  categories: readonly CategoryRecord[],
  recurrences: readonly RecurrenceRecord[],
  accountCurrency: string | undefined,
  consolidated = false,
  month = "",
): string {
  const { transaction } = row;
  const currency = consolidated
    ? accountCurrency
    : resolveTransactionCurrency(transaction, selectedAccount?.id, accountCurrency);
  if (transaction.group) return renderGroupRow(row, transaction.group, currency);
  const categoryName = transaction.categoryId
    ? (categories.find((category) => category.id === transaction.categoryId)?.name ??
      "Categoria não localizada")
    : "Sem categoria";
  const nextStatus = transaction.status === "reconciled" ? "posted" : "reconciled";
  const date = statementDate(transaction);
  const recurrence = transaction.recurrenceId
    ? recurrences.find((candidate) => candidate.id === transaction.recurrenceId)
    : undefined;
  const eligible =
    !consolidated &&
    Boolean(currency) &&
    (transaction.kind === "income" || transaction.kind === "expense") &&
    transaction.status !== "suggested" &&
    transaction.status !== "voided" &&
    !transaction.cardId &&
    !transaction.invoiceId &&
    !transaction.transactionGroupId;

  const rowGlyph = resolveRowGlyph(categoryName, transaction.kind);
  const consolidatedAccountId = consolidated
    ? resolveConsolidatedNavigationAccountId(transaction, accounts, accountCurrency)
    : undefined;
  const contextAccount = consolidated
    ? accounts.find((account) => account.id === consolidatedAccountId)
    : selectedAccount;
  return `<article class="statement-row statement-body${transaction.accountRemuneration ? " account-remuneration-row" : ""}" role="row" data-row-glyph="${escapeHtml(rowGlyph.key)}">
    <label class="col-select"><input type="checkbox" data-select-transaction value="${escapeHtml(transaction.id)}" data-kind="${escapeHtml(transaction.kind)}" data-status="${escapeHtml(transaction.status)}" data-currency="${escapeHtml(currency ?? "")}" data-amount="${row.amountMinor}" data-date="${escapeHtml(date)}" data-description="${escapeHtml(transaction.description)}" data-category="${escapeHtml(categoryName)}" aria-label="Selecionar lançamento ${escapeHtml(transaction.description || "sem descrição")}"${eligible ? "" : " disabled"}></label>
    ${renderRowGlyph(categoryName, transaction.kind)}
    <time class="col-date" datetime="${escapeHtml(date)}" title="${escapeHtml(formatDate(date))}">${formatMovementDate(date)}</time>
    <div class="description col-description">${renderTransactionDescription(transaction, contextAccount, accounts)}${consolidated ? renderConsolidatedAccountLabel(transaction, accounts) : ""}</div>
    ${renderCategoryChip(categoryName, transaction.kind)}<span class="col-kind">${escapeHtml(formatKind(transaction.kind))}</span>
    ${renderStatementStatus(transaction)}
    <strong class="col-amount ${row.amountMinor < 0 ? "debit" : "credit"}">${currency ? formatSignedAmount(row.amountMinor, currency) : "Moeda indisponível"}</strong>
    <strong class="col-balance${row.balanceAfterMinor < 0 ? " debit" : ""}" data-balance-minor="${row.balanceAfterMinor}">${currency ? formatMoney(row.balanceAfterMinor, currency) : "Moeda indisponível"}</strong>
    ${
      consolidated
        ? `<a class="col-actions" href="/lancamentos?accountId=${encodeURIComponent(consolidatedAccountId ?? "")}&month=${encodeURIComponent(month)}" aria-label="Ver lançamento na conta">Ver</a>`
        : `<details class="actions col-actions"><summary aria-label="Ações do lançamento ${escapeHtml(transaction.description || "sem descrição")}">${renderDotsIcon()}</summary><div class="actions-menu" role="menu">
      <button type="button" class="actions-item" data-edit="${escapeHtml(transaction.id)}">${renderEditIcon()}<span>Editar</span></button>
      <button type="button" class="actions-item" data-action data-method="PATCH" data-path="/api/transactions/${escapeHtml(transaction.id)}" data-payload='${escapeHtml(JSON.stringify({ status: nextStatus }))}'>${renderReconcileIcon(transaction.status === "reconciled")}<span>${transaction.status === "reconciled" ? "Desconciliar" : "Marcar como conciliado"}</span></button>
      ${renderTransactionCloneAction(transaction)}<hr class="actions-divider" />
      <button type="button" class="actions-item danger" data-action data-method="POST" data-path="/api/transactions/${escapeHtml(transaction.id)}/void" data-confirm="${escapeHtml(transaction.status === "reconciled" ? "Este lançamento já está conciliado. Excluir mesmo assim?" : "Excluir este lançamento?")}">${renderTrashIcon()}<span>Excluir</span></button>
      ${recurrence ? renderRecurrenceActionMenuItems(recurrence) : ""}
    </div></details>`
    }
    <script type="application/json" data-transaction="${escapeHtml(transaction.id)}">${serializeScriptJson(transaction)}</script>
  </article>`;
}

function renderTransactionDescription(
  transaction: TransactionRecord,
  selectedAccount: AccountRecord | undefined,
  accounts: readonly AccountRecord[],
): string {
  if (transaction.accountRemuneration) {
    return `<strong>Remuneração CDI${transaction.recurrenceId ? renderRecurrenceIndicator() : ""}</strong>${renderTransferNote(transaction, selectedAccount, accounts)}${renderAccountRemunerationAudit(transaction)}`;
  }
  const note = readNonEmpty(transaction.note);
  return `<strong>${escapeHtml(transaction.description || "(sem descrição)")}${transaction.recurrenceId ? renderRecurrenceIndicator() : ""}</strong>${note ? `<span class="description-note">${escapeHtml(note)}</span>` : ""}${renderTransferNote(transaction, selectedAccount, accounts)}`;
}

/** In a cross-currency transfer, open the account that belongs to the visible currency. */
function resolveConsolidatedNavigationAccountId(
  transaction: TransactionRecord,
  accounts: readonly AccountRecord[],
  currency: string | undefined,
): string {
  const belongsToSelectedCurrency = (id: string | undefined): boolean =>
    Boolean(
      id &&
      currency &&
      accounts.some(
        (account) =>
          account.id === id &&
          account.status === "active" &&
          resolveAccountCurrency(account) === currency,
      ),
    );
  if (belongsToSelectedCurrency(transaction.accountId)) return transaction.accountId ?? "";
  if (belongsToSelectedCurrency(transaction.destinationAccountId))
    return transaction.destinationAccountId ?? "";
  return "";
}

function renderConsolidatedAccountLabel(
  transaction: TransactionRecord,
  accounts: readonly AccountRecord[],
): string {
  const name = (id: string | undefined): string =>
    accounts.find((account) => account.id === id)?.name ?? "Conta não localizada";
  const label =
    transaction.kind === "transfer"
      ? `${name(transaction.accountId)} → ${name(transaction.destinationAccountId)}`
      : name(transaction.accountId);
  return `<span class="statement-row-account" title="Conta do lançamento">Conta: ${escapeHtml(label)}</span>`;
}

function renderTransactionCloneAction(transaction: TransactionRecord): string {
  if (transaction.accountRemuneration) return "";
  return `<button type="button" class="actions-item" data-clone="${escapeHtml(transaction.id)}">${renderCloneIcon()}<span>Clonar</span></button>`;
}

function renderGroupRow(
  row: StatementRow,
  group: TransactionGroupRecord,
  currency: string | undefined,
): string {
  return `<article class="statement-row statement-body grouped-row" role="row" data-row-glyph="${escapeHtml(resolveRowGlyph("", group.kind).key)}" data-group-row="${escapeHtml(group.id)}">
    <span class="col-select group-indicator" aria-label="Grupo de lançamentos">&#128279;</span>
    ${renderRowGlyph("", group.kind)}
    <time class="col-date" datetime="${escapeHtml(group.displayOn)}" title="${escapeHtml(formatDate(group.displayOn))}">${formatMovementDate(group.displayOn)}</time>
    <div class="description col-description"><strong>${escapeHtml(group.description)}</strong><span>${group.members.length} lançamentos agrupados</span></div>
    ${renderCategoryChip("Várias categorias", group.kind)}<span class="col-kind">${escapeHtml(formatKind(group.kind))}</span>${renderStatementStatus(row.transaction)}
    <strong class="col-amount ${row.amountMinor < 0 ? "debit" : "credit"}">${currency ? formatSignedAmount(row.amountMinor, currency) : "Moeda indisponível"}</strong>
    <strong class="col-balance${row.balanceAfterMinor < 0 ? " debit" : ""}" data-balance-minor="${row.balanceAfterMinor}">${currency ? formatMoney(row.balanceAfterMinor, currency) : "Moeda indisponível"}</strong>
    <button type="button" class="icon-btn col-actions" data-group-details="${escapeHtml(group.id)}" aria-label="Ver lançamentos do grupo">${renderDotsIcon()}</button>
    <script type="application/json" data-group="${escapeHtml(group.id)}">${serializeScriptJson(group)}</script>
  </article>`;
}

export function renderAccountRemunerationAudit(transaction: TransactionRecord): string {
  const remuneration = transaction.accountRemuneration;
  if (!remuneration) return "";
  const adjustment = remuneration.manuallyAdjusted
    ? '<span class="account-remuneration-adjustment adjusted">Ajustado manualmente</span>'
    : "";
  return `<details class="account-remuneration-audit" aria-label="Memória do cálculo da remuneração"><summary>Ver memória do cálculo</summary><div class="account-remuneration-audit-content">${adjustment}<dl><div><dt>Competência</dt><dd>${formatDate(remuneration.competenceOn)}</dd></div><div><dt>Saldo-base</dt><dd>${formatMoney(remuneration.balanceBaseMinor, "BRL")}</dd></div><div><dt>CDI diário</dt><dd>${formatPercentage(remuneration.dailyRatePercent, 8)}</dd></div><div><dt>Percentual aplicado</dt><dd>${formatPercentage(remuneration.remunerationPercent, 4)}</dd></div><div><dt>Valor original</dt><dd>${formatMoney(remuneration.originalAmountMinor, "BRL")}</dd></div></dl></div></details><span class="account-remuneration-summary">Competência ${formatDate(remuneration.competenceOn)} · ${formatPercentage(remuneration.remunerationPercent, 4)} do CDI</span>`;
}

function renderTransferNote(
  transaction: TransactionRecord,
  selectedAccount: AccountRecord | undefined,
  accounts: readonly AccountRecord[],
): string {
  if (transaction.kind !== "transfer") return "";
  const origin = accounts.find((account) => account.id === transaction.accountId)?.name;
  const destination = accounts.find(
    (account) => account.id === transaction.destinationAccountId,
  )?.name;
  const text =
    selectedAccount?.id === transaction.destinationAccountId
      ? `Recebida de ${origin ?? "outra conta"}`
      : `Enviada para ${destination ?? "outra conta"}`;
  return `<span>${escapeHtml(text)}</span>`;
}

function renderSummaryPanel(
  summary: StatementSummary,
  selectedAccount: AccountRecord | undefined,
  currency: string | undefined,
  consolidated = false,
  accountCount = 0,
): string {
  const money = (value: number) => (currency ? formatMoney(value, currency) : "Moeda indisponível");
  return `<aside class="panel account-summary" aria-label="${consolidated ? "Resumo consolidado" : "Resumo da conta"}"><div><p class="eyebrow">${consolidated ? "Resumo consolidado" : "Resumo da Conta"}</p><h2>${consolidated ? "Todas as contas (" + accountCount + ")" : escapeHtml(selectedAccount?.name ?? "Selecione uma conta")}</h2>${currency ? `<span class="statement-context-pill" data-context="summary-currency">${escapeHtml(currency)}</span>` : ""}</div><section class="summary-balance"><span>${consolidated ? "Saldo consolidado" : "Saldo atual"}</span><span class="summary-balance-line"><strong class="${summary.effectiveBalanceMinor < 0 ? "debit" : "credit"}">${money(summary.effectiveBalanceMinor)}</strong><button type="button" class="summary-balance-toggle" data-balance-toggle aria-pressed="false" aria-label="Ocultar saldo atual"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z"/><circle cx="10" cy="10" r="2.4"/></svg></button></span><p>Saldo efetivo com lançamentos realizados.</p></section><div class="summary-totals">${summaryTotal("opening", "Saldo inicial", summary.openingMinor, "neutral", currency)}${summaryTotal("income", "Entradas", summary.incomeMinor, "credit", currency)}${summaryTotal("expense", "Saídas", -summary.expenseMinor, "debit", currency)}${summaryTotal("closing", "Saldo final", summary.effectiveBalanceMinor, summary.effectiveBalanceMinor < 0 ? "debit" : "neutral", currency)}</div><section class="status-overview" aria-label="Status dos lançamentos"><h3>Status</h3>${statusLine("Conciliados", summary.reconciledCount, summary.reconciledMinor, "ok", currency)}${statusLine("Não conciliados", summary.unreconciledCount, summary.unreconciledMinor, "posted", currency)}${statusLine("Pendentes", summary.pendingCount, summary.pendingMinor, "pending", currency)}</section></aside>`;
}

const SUMMARY_ICONS: Record<string, string> = {
  opening:
    '<path d="M4 15V7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M12 7v6m0 0-2.5-2.5M12 13l2.5-2.5"/>',
  income: '<path d="M6 14 14 6m0 0H7.5M14 6v6.5"/>',
  expense: '<path d="M6 6l8 8m0 0V7.5M14 14H7.5"/>',
  closing: '<path d="M4 7h12M4 12h12M4 17h7"/>',
};

/** Each summary keeps its own tone and glyph so the four indicators read at a glance. */
function summaryTotal(
  variant: string,
  label: string,
  amountMinor: number,
  tone: string,
  currency: string | undefined,
): string {
  const value = currency ? formatMoney(amountMinor, currency) : "Moeda indisponível";
  return `<div class="summary-total" data-summary-total="${variant}"><span class="summary-total-icon" aria-hidden="true"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${SUMMARY_ICONS[variant] ?? SUMMARY_ICONS.opening}</svg></span><span class="summary-total-copy"><span>${escapeHtml(label)}</span><strong class="${tone}">${value}</strong></span></div>`;
}

function statusLine(
  label: string,
  count: number,
  amountMinor: number,
  tone: string,
  currency: string | undefined,
): string {
  return `<div class="status-line"><span class="chip chip-${tone}">${count}</span><p>${escapeHtml(label)}</p><strong>${currency ? formatMoney(amountMinor, currency) : "Moeda indisponível"}</strong></div>`;
}

function chip(label: string, count: number, tone: string): string {
  return `<span class="chip chip-${tone}"><strong>${count}</strong>${escapeHtml(label)}</span>`;
}

function renderAccountPicker(
  accounts: readonly AccountRecord[],
  selectedAccount: AccountRecord | undefined,
  selectedId: string | undefined,
  consolidatedCurrency?: string,
  availableCurrencies: readonly string[] = [],
): string {
  const consolidated = selectedId === "all";
  const institution = findInstitution(selectedAccount?.institutionKey);
  const triggerIcon = consolidated
    ? '<span aria-hidden="true">▦</span>'
    : renderInstitutionIcon(institution.key);
  const identitySub = consolidated
    ? "Lançamentos de todas as contas na moeda escolhida"
    : selectedAccount
      ? [
          resolveAccountCurrency(selectedAccount)
            ? `Moeda: ${resolveAccountCurrency(selectedAccount)}`
            : "",
          institution.label,
          ACCOUNT_KIND_LABELS[selectedAccount.kind],
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  const displayedCurrency = consolidated
    ? consolidatedCurrency
    : resolveAccountCurrency(selectedAccount);
  // Only All accounts can change the currency; an individual account displays
  // its currency first in the selector subtitle without shrinking the account field.
  const currencySelect = consolidated
    ? `<label class="statement-currency-field" for="statement-currency"><span>Moeda</span><select id="statement-currency" name="currency" required data-auto-currency>${availableCurrencies.map((code) => `<option value="${escapeHtml(code)}"${code === displayedCurrency ? " selected" : ""}>${escapeHtml(code)}</option>`).join("")}</select></label>`
    : "";
  return `<div class="account-field" data-currency-picker${consolidated ? " data-all-accounts" : ""} data-account-picker><label id="account-picker-label">Conta</label><div class="account-select"><button type="button" class="account-select-trigger" data-account-trigger aria-haspopup="listbox" aria-expanded="false" aria-labelledby="account-picker-label"><span class="account-select-icon">${triggerIcon}</span><span class="account-select-copy"><span class="account-select-text">${consolidated ? "Todas as contas" : selectedAccount ? escapeHtml(selectedAccount.name) : "Selecione uma conta"}</span>${identitySub ? `<span class="account-select-sub">${escapeHtml(identitySub)}</span>` : ""}</span><svg class="account-select-chevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><input type="hidden" name="accountId" value="${escapeHtml(selectedId ?? "")}" required data-account-input /><ul class="account-select-menu" role="listbox" hidden data-account-menu aria-labelledby="account-picker-label"><li role="option" tabindex="-1" data-account-option="all" data-account-name="Todas as contas" data-account-currency="" aria-selected="${consolidated}"><span class="account-select-icon" aria-hidden="true">▦</span><span>Todas as contas</span></li>${accounts.map((account) => renderAccountOption(account, selectedId)).join("")}</ul></div>${currencySelect}</div>`;
}

const FILTER_ICONS: Readonly<Record<string, string>> = {
  category:
    '<path d="M3 10.5V5a2 2 0 0 1 2-2h5.5L17 9.5a1.5 1.5 0 0 1 0 2.1l-5.4 5.4a1.5 1.5 0 0 1-2.1 0Z"/><circle cx="7.2" cy="7.2" r="1.1"/>',
  kind: '<path d="M4 15.5 13 6.5m0 0 2 2M13 6.5 11 4.5"/><path d="M4 15.5V17h1.5l8.4-8.4"/>',
  status: '<path d="M3 11h3l1.6-4.4a.6.6 0 0 1 1.1 0l3.4 8.6a.6.6 0 0 0 1.1 0L15 11h2"/>',
  reconciliation:
    '<path d="M5 3.5h7L15.5 7v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M11.8 3.6V7h3.4"/><path d="M7 11.5h6M7 14h4"/>',
  sort: '<path d="M6 5v10m0 0-2.2-2.2M6 15l2.2-2.2"/><path d="M13 15V5m0 0-2.2 2.2M13 5l2.2 2.2"/>',
};

/** Decorative glyphs that give each filter the same glanceability as the reference. */
function filterIcon(name: string): string {
  return `<svg class="filter-field-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FILTER_ICONS[name] ?? ""}</svg>`;
}

const ACCOUNT_KIND_LABELS: Readonly<Record<string, string>> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Carteira",
  investment: "Investimento",
  other: "Outro",
};

function renderAccountOption(account: AccountRecord, selected?: string): string {
  const institution = findInstitution(account.institutionKey);
  const currency = resolveAccountCurrency(account);
  return `<li role="option" tabindex="-1" data-account-option="${escapeHtml(account.id)}" data-account-name="${escapeHtml(account.name)}" data-account-currency="${escapeHtml(currency ?? "")}" aria-selected="${selected === account.id}"><span class="account-select-icon">${renderInstitutionIcon(institution.key)}</span><span>${escapeHtml(account.name)}${currency ? ` · ${escapeHtml(currency)}` : " · moeda indisponível"}</span></li>`;
}

function renderModal(
  selectedAccount: AccountRecord | undefined,
  accounts: readonly AccountRecord[],
  categories: readonly CategoryRecord[],
  currency: string | undefined,
): string {
  return `<dialog data-modal><section class="modal-panel"><form method="dialog" class="close-form"><button type="submit" aria-label="Fechar">&times;</button></form><div class="statement-entry-heading"><p class="eyebrow">Lançamento da conta</p><h2 data-modal-title>Novo lançamento</h2><p class="muted">Adicione um lançamento manual na sua conta.</p></div><form data-form data-path="/api/transactions"><input name="accountId" type="hidden" value="${escapeHtml(selectedAccount?.id ?? "")}" /><label data-field="kind">Tipo<select name="kind" required>${renderKindOptions()}</select></label><label data-field="sourceAccount" hidden><span class="field-label">Conta origem</span><input data-source-account-display value="${escapeHtml(formatAccountLabel(selectedAccount))}" readonly aria-readonly="true" /></label><label data-field="destinationAccountId" hidden><span class="field-label">Conta destino</span><select name="destinationAccountId" data-destination-account-select disabled><option value="" data-currency="">Selecione a conta destino</option>${renderAccountOptions(accounts)}</select></label><label class="full statement-entry-account"><span class="field-label">Conta</span><input value="${escapeHtml(formatAccountLabel(selectedAccount))}" readonly aria-readonly="true" /></label><label data-field="occurredOn">Data do evento<input name="occurredOn" type="date" required /></label><label><span class="field-label">Valor origem <span class="nowrap">(<span data-source-currency>${escapeHtml(currency ?? "moeda indisponível")}</span>)</span></span><input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label><label data-field="destinationAmountMinor" hidden><span class="field-label">Valor destino <span class="nowrap">(<span data-destination-currency>moeda destino</span>)</span></span><input name="destinationAmountMinor" data-destination-money inputmode="decimal" placeholder="0,00" /></label><label data-field="effectiveRate" hidden><span class="field-label">Taxa efetiva</span><span class="rate-value"><output data-effective-rate>Informe os dois valores</output><span class="muted" data-effective-rate-direction></span></span></label><label class="full">Descrição<input name="description" maxlength="240" required placeholder="Ex.: Supermercado São Vicente" /></label><label class="full">Categoria<select name="categoryId" data-category-select><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label><label class="full">Observação<textarea name="note" rows="3" maxlength="200" placeholder="Informações adicionais (opcional)"></textarea></label><details class="statement-entry-advanced full"><summary>Mais opções</summary><div class="statement-entry-advanced-grid"><label>Data prevista<input name="plannedOn" type="date" /></label><label>Data efetiva<input name="effectiveOn" type="date" /></label><label>Repetição<select name="repeatMode"><option value="single">Único</option><option value="installment">Parcelado</option><option value="fixed" data-repeat-option="fixed">Fixo</option></select></label><p class="muted full" data-cross-currency-repeat-hint hidden>Transferências entre moedas diferentes são salvas como ocorrência única; recorrência e parcelamento não estão disponíveis.</p><label data-field="installments">Parcelas<input name="installments" type="number" min="2" max="60" value="2" /></label><label data-field="installmentStart">Parcela inicial<input name="installmentStart" type="number" min="1" max="60" value="1" /></label><label data-field="installmentValueMode">Valor informado<select name="installmentValueMode"><option value="per_installment">Valor da parcela</option><option value="total">Valor total (dividir pelas parcelas)</option></select></label><label data-field="interval">A cada<input name="interval" type="number" min="1" max="60" value="1" /></label><label data-field="frequency">Frequência<select name="frequency"><option value="daily">Dia(s)</option><option value="weekly">Semana(s)</option><option value="monthly" selected>Mês(es)</option><option value="yearly">Ano(s)</option></select></label><label data-field="endOn">Fim opcional<input name="endOn" type="date" /></label></div></details><input type="hidden" name="status" value="posted" /><div class="full save-row"><div class="status-icons" role="radiogroup" aria-label="Situação do lançamento">${renderStatusIcon("posted", "Efetivado não conciliado", '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/>')}${renderStatusIcon("reconciled", "Conciliado", '<path d="M4 10l4 4 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')}${renderStatusIcon("planned", "Previsto/pendente", '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')}<span class="status-label" data-status-label>Efetivado não conciliado</span></div><button type="submit"${selectedAccount && currency ? "" : " disabled"}>Salvar lançamento</button></div></form>${renderAttachmentWorkspace({ entityKind: "transaction", title: "Anexos do lançamento", className: "full" })}</section></dialog>`;
}

function renderGroupModal(
  selectedAccount: AccountRecord | undefined,
  currency: string | undefined,
): string {
  return `<dialog data-group-modal style="width:min(760px,calc(100% - 32px));max-width:min(760px,calc(100% - 32px))"><section class="modal-panel group-modal-panel"><header><div><p class="eyebrow">Agrupamento</p><h2 data-group-title>Unificar lançamentos</h2></div><button type="button" class="icon-btn" data-group-close aria-label="Fechar">&times;</button></header><form data-group-form><label>Descrição do grupo<input name="description" maxlength="240" required></label><label>Data de exibição<input name="displayOn" type="date" required></label><label>Conta<input value="${escapeHtml(selectedAccount?.name ?? "")}" readonly></label><label>Moeda<input value="${escapeHtml(currency ?? "Moeda indisponível")}" readonly></label><div class="group-readonly" data-group-summary></div><div class="group-members" data-group-members></div><p class="form-error" data-group-error hidden></p><div class="save-row"><button type="button" class="ghost-btn" data-group-close>Cancelar</button><button type="submit">Unificar</button><button type="button" class="danger" data-group-ungroup hidden>Desagrupar lançamentos</button></div></form></section></dialog>`;
}

function renderCategoryOptions(categories: readonly CategoryRecord[], selected?: string): string {
  return buildCategoryHierarchy(categories)
    .map(
      ({ category, depth }) =>
        `<option value="${escapeHtml(category.id)}" data-kind="${escapeHtml(category.kind)}"${selected === category.id ? " selected" : ""}>${depth > 0 ? "  ".repeat(depth) + "↳ " : ""}${escapeHtml(category.name)}</option>`,
    )
    .join("");
}

function buildCategoryHierarchy(
  categories: readonly CategoryRecord[],
): { category: CategoryRecord; depth: number }[] {
  const ids = new Set(categories.map((category) => category.id));
  const childrenByParent = new Map<string | undefined, CategoryRecord[]>();
  for (const category of categories) {
    // The API may return null for a root. Keep orphaned entries selectable too.
    const parent = category.parentCategoryId;
    const parentId = parent && parent !== category.id && ids.has(parent) ? parent : undefined;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(category);
    childrenByParent.set(parentId, siblings);
  }
  const rows: { category: CategoryRecord; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | undefined, depth: number): void => {
    for (const category of childrenByParent.get(parentId) ?? []) {
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(undefined, 0);
  // Malformed circular parent references must never recurse indefinitely or hide options.
  for (const category of categories) {
    if (visited.has(category.id)) continue;
    visited.add(category.id);
    rows.push({ category, depth: 0 });
    walk(category.id, 1);
  }
  return rows;
}

function renderKindOptions(): string {
  return [
    ["income", "Entrada"],
    ["expense", "Saída"],
    ["transfer", "Transferência"],
  ]
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function renderAccountOptions(accounts: readonly AccountRecord[]): string {
  return accounts
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}" data-currency="${escapeHtml(resolveAccountCurrency(account) ?? "")}">${escapeHtml(formatAccountLabel(account))}</option>`,
    )
    .join("");
}

function formatAccountLabel(account: AccountRecord | undefined): string {
  if (!account) return "Selecione uma conta";
  return `${account.name} · ${resolveAccountCurrency(account) ?? "moeda indisponível"}`;
}

function renderStatusIcon(value: string, label: string, iconPaths: string): string {
  return `<button type="button" class="status-icon-btn" data-status-option="${value}" data-status-label-text="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${iconPaths}</svg></button>`;
}

function renderDotsIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="19" r="1.9" fill="currentColor"/></svg>`;
}
function renderEditIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}
function renderCloneIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}
function renderTrashIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function renderReconcileIcon(isReconciled: boolean): string {
  return isReconciled
    ? `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 14 5 10l4-4M5 10h9a5 5 0 1 1 0 10h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function clientScript(currency: string | undefined, accounts: readonly AccountRecord[]): string {
  return String.raw`<script data-statement-a2-runtime="true">
  (() => {
    const statementCurrency = ${JSON.stringify(currency ?? "")};
    const accountCurrencies = new Map(${serializeScriptJson(
      accounts.map((account) => [account.id, resolveAccountCurrency(account) ?? ""]),
    )});
    const accountLabels = new Map(${serializeScriptJson(
      accounts.map((account) => [account.id, formatAccountLabel(account)]),
    )});
    const modal = document.querySelector("[data-modal]");
    const form = document.querySelector("[data-form]");
    if (!form || !modal) return;
    const statusNode = document.createElement("p");
    statusNode.className = "form-status muted full";
    statusNode.setAttribute("aria-live", "polite");
    form.appendChild(statusNode);
    const remunerationIds = new Set();
    const unlockRemunerationFields = () => {
      form.dataset.remunerationProtected = "false";
      form.querySelectorAll("[data-remuneration-protected]").forEach((field) => {
        field.removeAttribute("data-remuneration-protected");
        field.removeAttribute("aria-disabled");
        if ("readOnly" in field) field.readOnly = false;
      });
      form.querySelector("[data-remuneration-edit-notice]")?.remove();
    };
    const protectRemunerationField = (field) => {
      if (!field) return;
      field.setAttribute("data-remuneration-protected", "true");
      field.setAttribute("aria-disabled", "true");
      field.dataset.remunerationValue = field.value;
      if ("readOnly" in field) field.readOnly = true;
    };
    const lockRemunerationFields = () => {
      unlockRemunerationFields();
      form.dataset.remunerationProtected = "true";
      const repeatMode = form.elements.repeatMode;
      if (repeatMode) repeatMode.value = "single";
      [form.elements.kind, form.elements.plannedOn, form.elements.description, repeatMode, form.querySelector("[data-edit-account-select]")].forEach(protectRemunerationField);
      const saveRow = form.querySelector(".save-row");
      if (saveRow && !form.querySelector("[data-remuneration-edit-notice]")) {
        const notice = document.createElement("p");
        notice.className = "remuneration-edit-notice";
        notice.setAttribute("data-remuneration-edit-notice", "");
        notice.textContent = "Neste lançamento, altere somente o valor creditado, a categoria, a situação e a data efetiva. Conta, tipo, competência e memória do cálculo permanecem protegidos.";
        saveRow.before(notice);
      }
    };
    form.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (target?.matches?.('select[data-remuneration-protected="true"]')) event.preventDefault();
    }, true);
    form.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target?.matches?.('select[data-remuneration-protected="true"]')) event.preventDefault();
    }, true);
    form.addEventListener("change", (event) => {
      const target = event.target;
      if (target?.matches?.('[data-remuneration-protected="true"]')) target.value = target.dataset.remunerationValue || target.value;
    }, true);

    const moneyToMinor = (value) => Math.round(parseFloat(String(value).replace(/\./g, "").replace(",", ".") || "0") * 100);
    const minorToMoneyInput = (amountMinor) => (amountMinor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const money = (minor, currencyCode) => /^[A-Z]{3}$/.test(currencyCode || "") ? (Number(minor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: currencyCode }) : "Moeda indisponível";
    const currentLocalDate = () => { const now = new Date(); return String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0"); };
    const moneyInput = form.querySelector("[data-money]");
    const destinationMoneyInput = form.querySelector("[data-destination-money]");
    moneyInput?.addEventListener("input", () => { const digits = moneyInput.value.replace(/\D/g, ""); moneyInput.value = minorToMoneyInput(digits ? parseInt(digits, 10) : 0); syncEffectiveRate(); });
    destinationMoneyInput?.addEventListener("input", () => { const digits = destinationMoneyInput.value.replace(/\D/g, ""); destinationMoneyInput.value = minorToMoneyInput(digits ? parseInt(digits, 10) : 0); syncEffectiveRate(); });

    const setFieldVisible = (name, visible) => { const field = form.querySelector('[data-field="' + name + '"]'); if (field) field.hidden = !visible; };
    const syncCategoryOptions = () => {
      const select = form.querySelector("[data-category-select]"); if (!select) return;
      let selectedHidden = false;
      Array.from(select.options).forEach((option) => { if (!option.dataset.kind) return; const visible = option.dataset.kind === form.kind.value; option.hidden = !visible; if (!visible && option.selected) selectedHidden = true; });
      if (selectedHidden) select.value = "";
    };
    // Create mode submits the hidden statement account; edit mode (#473) swaps in an enabled select.
    const sourceAccountId = () => String(Array.from(form.querySelectorAll('[name="accountId"]')).find((field) => !field.disabled)?.value || "");
    const sourceCurrency = () => accountCurrencies.get(sourceAccountId()) || statementCurrency;
    const destinationCurrency = () => String(form.destinationAccountId.selectedOptions?.[0]?.dataset.currency || "");
    const isCrossCurrencyTransfer = () => form.kind.value === "transfer" && Boolean(destinationCurrency()) && destinationCurrency() !== sourceCurrency();
    const formatEffectiveRate = (sourceMinor, destinationMinor) => {
      if (!Number.isSafeInteger(sourceMinor) || !Number.isSafeInteger(destinationMinor) || sourceMinor <= 0 || destinationMinor <= 0) return "Informe os dois valores";
      const scale = 1000000n;
      const denominator = BigInt(sourceMinor);
      const rounded = (BigInt(destinationMinor) * scale + denominator / 2n) / denominator;
      const whole = rounded / scale;
      const fraction = (rounded % scale).toString().padStart(6, "0").replace(/0+$/, "");
      return fraction ? whole.toString() + "," + fraction : whole.toString();
    };
    const syncEffectiveRate = () => {
      const output = form.querySelector("[data-effective-rate]");
      const direction = form.querySelector("[data-effective-rate-direction]");
      const sourceMinor = moneyToMinor(moneyInput?.value || "0");
      const destinationMinor = moneyToMinor(destinationMoneyInput?.value || "0");
      const source = sourceCurrency();
      const destination = destinationCurrency();
      if (direction) direction.textContent = source && destination ? destination + " por " + source : "";
      if (!output) return;
      output.textContent = formatEffectiveRate(sourceMinor, destinationMinor);
    };
    const syncTransferCurrencyState = () => {
      const source = sourceCurrency();
      const destination = destinationCurrency();
      const crossCurrency = isCrossCurrencyTransfer();
      const sourceNode = form.querySelector("[data-source-currency]");
      const destinationNode = form.querySelector("[data-destination-currency]");
      if (sourceNode) sourceNode.textContent = source || "moeda indisponível";
      if (destinationNode) destinationNode.textContent = destination || "moeda destino";
      setFieldVisible("destinationAmountMinor", crossCurrency);
      setFieldVisible("effectiveRate", crossCurrency);
      if (destinationMoneyInput) destinationMoneyInput.required = crossCurrency;
      const repeatHint = form.querySelector("[data-cross-currency-repeat-hint]");
      if (repeatHint) repeatHint.hidden = !crossCurrency;
      const installmentOption = form.repeatMode.querySelector('option[value="installment"]');
      if (installmentOption) installmentOption.disabled = crossCurrency;
      const fixedOption = form.repeatMode.querySelector('[data-repeat-option="fixed"]');
      if (fixedOption) fixedOption.disabled = crossCurrency;
      if (crossCurrency && form.repeatMode.value !== "single") form.repeatMode.value = "single";
      syncEffectiveRate();
    };
    const syncTransferAccounts = () => {
      const transfer = form.kind.value === "transfer";
      const destinationSelect = form.destinationAccountId;
      const sourceId = sourceAccountId();
      const editAccountField = form.querySelector("[data-edit-account-field]");
      const editingSource = Boolean(editAccountField && !editAccountField.hidden);
      if (editAccountField?.firstChild?.nodeType === 3) editAccountField.firstChild.nodeValue = transfer ? "Conta origem" : "Conta";
      const sourceDisplay = form.querySelector("[data-source-account-display]");
      if (sourceDisplay) sourceDisplay.value = accountLabels.get(sourceId) || "Conta indisponível";
      setFieldVisible("sourceAccount", transfer && !editingSource);
      setFieldVisible("destinationAccountId", transfer);
      destinationSelect.disabled = !transfer;
      destinationSelect.required = transfer;
      Array.from(destinationSelect.options).forEach((option) => { if (option.value) option.disabled = option.value === sourceId; });
      if (!transfer) {
        destinationSelect.value = "";
        if (destinationMoneyInput) { destinationMoneyInput.value = ""; destinationMoneyInput.dataset.currency = ""; }
      }
      destinationSelect.setCustomValidity(transfer && destinationSelect.value && destinationSelect.value === sourceId ? "Escolha uma conta destino diferente da conta origem." : "");
    };
    const syncFieldVisibility = () => {
      syncTransferAccounts();
      syncTransferCurrencyState();
      const repeatMode = form.repeatMode.value;
      const usesGenericTemporalFields = repeatMode === "single" || form.dataset.method === "PATCH";
      setFieldVisible("occurredOn", usesGenericTemporalFields); form.occurredOn.required = usesGenericTemporalFields;
      ["installments", "installmentStart", "installmentValueMode"].forEach((name) => setFieldVisible(name, repeatMode === "installment"));
      ["interval", "frequency", "endOn"].forEach((name) => setFieldVisible(name, repeatMode === "fixed"));
      syncCategoryOptions();
    };
    form.addEventListener("change", (event) => {
      if (event.target.name === "destinationAccountId" && destinationMoneyInput) {
        const nextCurrency = destinationCurrency();
        const previousCurrency = destinationMoneyInput.dataset.currency || "";
        if (previousCurrency && previousCurrency !== nextCurrency) destinationMoneyInput.value = "";
        destinationMoneyInput.dataset.currency = nextCurrency;
      }
      if (event.target.name === "kind" || event.target.name === "repeatMode" || event.target.name === "accountId" || event.target.name === "destinationAccountId") syncFieldVisibility();
    });

    const statusButtons = Array.from(form.querySelectorAll("[data-status-option]"));
    const statusLabel = form.querySelector("[data-status-label]");
    const setStatus = (value) => { form.status.value = value; statusButtons.forEach((button) => { const active = button.dataset.statusOption === value; button.classList.toggle("active", active); if (active && statusLabel) statusLabel.textContent = button.dataset.statusLabelText; }); };
    statusButtons.forEach((button) => button.addEventListener("click", () => setStatus(button.dataset.statusOption)));

    const addMonths = (dateValue, months) => { const date = new Date(dateValue + "T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString().slice(0, 10); };
    const shiftMonth = (monthValue, steps) => { const [year, month] = monthValue.split("-").map(Number); return new Date(Date.UTC(year, month - 1 + steps, 1)).toISOString().slice(0, 7); };
    const monthInput = document.querySelector("#filter-month");
    document.querySelectorAll("[data-month-step]").forEach((button) => button.addEventListener("click", () => { monthInput.value = shiftMonth(monthInput.value, Number(button.dataset.monthStep)); monthInput.form?.requestSubmit(); }));
    document.querySelectorAll("[data-month-current]").forEach((button) => button.addEventListener("click", () => { monthInput.value = new Date().toISOString().slice(0, 7); monthInput.form?.requestSubmit(); }));
    monthInput.addEventListener("change", () => { monthInput.form?.querySelectorAll('input[name="from"],input[name="to"]').forEach((node) => node.remove()); monthInput.form?.requestSubmit(); });
    document.querySelectorAll("[data-auto-submit]").forEach((autoForm) => autoForm.addEventListener("change", (event) => { if (event.target.name === "accountId" || event.target.name === "sort") autoForm.requestSubmit(); }));

    const accountPicker = document.querySelector("[data-account-picker]");
    if (accountPicker) {
      const trigger = accountPicker.querySelector("[data-account-trigger]"); const menu = accountPicker.querySelector("[data-account-menu]"); const input = accountPicker.querySelector("[data-account-input]");
      const close = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
      trigger.addEventListener("click", () => { menu.hidden = !menu.hidden; trigger.setAttribute("aria-expanded", String(!menu.hidden)); });
      menu.querySelectorAll("[data-account-option]").forEach((option) => option.addEventListener("click", () => { input.value = option.dataset.accountOption; if (input.value !== "all") { const currencyField = accountPicker.querySelector("[data-auto-currency]"); if (currencyField) currencyField.disabled = true; } close(); input.dispatchEvent(new Event("change", { bubbles: true })); }));
      document.addEventListener("click", (event) => { if (!accountPicker.contains(event.target)) close(); });
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    }

    const withActiveProfile = (path) => { const profileId = new URL(location.href).searchParams.get("profileId"); if (!profileId) return path; return path + (path.includes("?") ? "&" : "?") + "profileId=" + encodeURIComponent(profileId); };
    const send = (path, method, body) => fetch(withActiveProfile(path), { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const transactionErrorMessages = {
      TRANSACTION_KIND_REQUIRED: "Informe o tipo do lançamento.",
      TRANSACTION_KIND_INVALID: "O tipo de lançamento informado não é suportado.",
      TRANSACTION_STATUS_INVALID: "A situação do lançamento informada não é suportada.",
      TRANSACTION_SOURCE_INVALID: "A origem do lançamento informada não é suportada.",
      TRANSACTION_AMOUNT_INVALID: "Informe um valor válido maior que zero.",
      TRANSACTION_DATE_REQUIRED: "Informe a data do evento.",
      TRANSACTION_EFFECTIVE_DATE_REQUIRED: "Lançamentos efetivados ou conciliados exigem data efetiva.",
      TRANSACTION_ACCOUNT_REQUIRED: "Selecione uma conta para o lançamento.",
      TRANSACTION_ACCOUNT_INVALID: "A conta selecionada não corresponde ao lançamento.",
      TRANSACTION_ACCOUNT_ARCHIVED: "A conta selecionada precisa estar ativa.",
      TRANSACTION_DESTINATION_ACCOUNT_REQUIRED: "Selecione a conta de destino da transferência.",
      TRANSACTION_DESTINATION_ACCOUNT_INVALID: "A conta de destino da transferência é inválida.",
      TRANSACTION_DESTINATION_AMOUNT_REQUIRED: "Informe o valor que será creditado na conta de destino.",
      TRANSACTION_DESTINATION_AMOUNT_INVALID: "O valor da conta de destino precisa ser maior que zero e compatível com a transferência.",
      TRANSACTION_TRANSFER_SAME_ACCOUNT: "A conta de origem e a conta de destino devem ser diferentes.",
      TRANSACTION_CURRENCY_MISMATCH: "A moeda do lançamento deve ser a mesma da conta.",
      TRANSACTION_CATEGORY_INVALID: "A categoria selecionada é inválida.",
      TRANSACTION_CATEGORY_ARCHIVED: "A categoria selecionada precisa estar ativa.",
      RECURRENCE_DESTINATION_ACCOUNT_REQUIRED: "Selecione a conta de destino da transferência recorrente.",
      RECURRENCE_DESTINATION_ACCOUNT_INVALID: "A conta de destino da recorrência é inválida.",
      RECURRENCE_TRANSFER_SAME_ACCOUNT: "A conta de origem e a conta de destino devem ser diferentes.",
      RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED: "Transferências fixas exigem contas de origem e destino na mesma moeda."
    };
    const safeMessageCodes = new Set(["INSTALLMENT_PAYLOAD_INVALID"]);
    const message = async (response) => { const body = await response.json().catch(() => ({})); if (response.ok) return "Ação concluída. Atualizando..."; const code = String((body.error && body.error.code) || ""); const safeDetail = safeMessageCodes.has(code) ? String(body?.error?.message || "") : ""; return transactionErrorMessages[code] || safeDetail || "Não foi possível concluir a ação. Revise os dados e tente novamente."; };

    const basePayload = (plannedOn, effectiveOn, amountMinor, description) => {
      const data = new FormData(form);
      const occurredOn = String(data.get("occurredOn") || "").trim();
      const status = String(data.get("status"));
      const normalizedPlannedOn = String(plannedOn || "").trim() || occurredOn;
      const explicitEffectiveOn = String(effectiveOn || "").trim(); const isCreate = (form.dataset.method || "POST") === "POST";
      const normalizedEffectiveOn = status === "posted" || status === "reconciled" ? (explicitEffectiveOn || (isCreate ? occurredOn : undefined)) : null;
      const result = { kind: String(data.get("kind")), amountMinor, occurredOn, plannedOn: normalizedPlannedOn, accountId: String(data.get("accountId")), description, status };
      if (normalizedEffectiveOn !== undefined) result.effectiveOn = normalizedEffectiveOn;
      const destinationAccountId = String(data.get("destinationAccountId") || ""); const categoryId = String(data.get("categoryId") || ""); const note = String(data.get("note") || "").trim();
      if (destinationAccountId && result.kind === "transfer") result.destinationAccountId = destinationAccountId;
      if (isCrossCurrencyTransfer()) result.destinationAmountMinor = moneyToMinor(data.get("destinationAmountMinor"));
      if (categoryId) result.categoryId = categoryId; if (note) result.note = note; return result;
    };
    const payload = () => { const data = new FormData(form); return basePayload(String(data.get("plannedOn") || ""), String(data.get("effectiveOn") || ""), moneyToMinor(data.get("amountMinor")), String(data.get("description") || "")); };
    const newIdempotencyKey = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);

    document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => { if (button.disabled) return; const attachmentWorkspace = modal.querySelector("[data-attachment-workspace]"); if (attachmentWorkspace) attachmentWorkspace.dataset.entityId = ""; form.reset(); const today = currentLocalDate(); form.occurredOn.value = today; form.plannedOn.value = today; form.dataset.path = "/api/transactions"; form.dataset.method = "POST"; if (button.dataset.quickKind) form.kind.value = button.dataset.quickKind; setStatus("posted"); syncFieldVisibility(); modal.showModal(); window.setTimeout(syncFieldVisibility, 0); }));
    document.querySelectorAll("[data-transaction]").forEach((node) => {
      const transaction = JSON.parse(node.textContent);
      if (transaction.accountRemuneration) remunerationIds.add(transaction.id);
      const hydrate = (selector, clone) => { const button = document.querySelector(selector + transaction.id + '"]'); if (!button) return; button.addEventListener("click", () => { form.reset(); form.dataset.path = clone ? "/api/transactions" : "/api/transactions/" + transaction.id; form.dataset.method = clone ? "POST" : "PATCH"; form.kind.value = transaction.kind; form.accountId.value = transaction.accountId || form.accountId.value; form.amountMinor.value = minorToMoneyInput(transaction.amountMinor); form.occurredOn.value = transaction.occurredOn; form.plannedOn.value = transaction.plannedOn || transaction.occurredOn; form.effectiveOn.value = transaction.effectiveOn || ""; setStatus(transaction.status === "reconciled" ? "reconciled" : transaction.effectiveOn ? "posted" : "planned"); form.destinationAccountId.value = transaction.destinationAccountId || ""; if (destinationMoneyInput) { destinationMoneyInput.value = transaction.destinationAmountMinor ? minorToMoneyInput(transaction.destinationAmountMinor) : ""; destinationMoneyInput.dataset.currency = transaction.destinationCurrency || destinationCurrency(); } form.categoryId.value = transaction.categoryId || ""; form.description.value = clone ? "Cópia de " + transaction.description : transaction.description; const attachmentWorkspace = modal.querySelector("[data-attachment-workspace]"); if (attachmentWorkspace) attachmentWorkspace.dataset.entityId = clone ? "" : transaction.id; document.querySelector("[data-modal-title]").textContent = clone ? "Clonar lançamento" : "Editar lançamento"; syncFieldVisibility(); modal.showModal(); window.setTimeout(syncFieldVisibility, 0); }); };
      hydrate('[data-edit="', false); hydrate('[data-clone="', true);
    });
    const positionActions = (details) => {
      const menu = details.querySelector(":scope > div");
      const summary = details.querySelector("summary");
      if (!menu || !summary) return;
      const rect = summary.getBoundingClientRect();
      menu.style.position = "fixed";
      menu.style.top = "0px";
      menu.style.left = "0px";
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
      const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight - 8;
      const top = fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6);
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    };
    const closeActions = () => document.querySelectorAll(".actions[open]").forEach((details) => details.removeAttribute("open"));
    document.querySelectorAll(".actions").forEach((details) => {
      const menu = details.querySelector(":scope > div");
      if (!menu) return;
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        document.querySelectorAll(".actions[open]").forEach((other) => { if (other !== details) other.removeAttribute("open"); });
        positionActions(details);
      });
    });
    document.querySelectorAll(".actions-item").forEach((item) => item.addEventListener("click", closeActions));
    let actionsFrame = 0;
    const repositionActions = () => {
      if (actionsFrame) return;
      actionsFrame = window.requestAnimationFrame(() => { actionsFrame = 0; document.querySelectorAll(".actions[open]").forEach(positionActions); });
    };
    window.addEventListener("scroll", repositionActions, true);
    window.addEventListener("resize", repositionActions);
    document.addEventListener("click", (event) => {
      document.querySelectorAll(".actions[open]").forEach((details) => {
        if (!details.contains(event.target)) details.removeAttribute("open");
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll(".actions[open]").forEach((details) => {
        const summary = details.querySelector("summary");
        details.removeAttribute("open");
        if (summary) summary.focus();
      });
    });
    document.addEventListener("click", (event) => {
      const target = event.target?.closest?.("[data-edit], [data-clone], [data-open-modal]");
      if (!target) return;
      const editId = target.getAttribute("data-edit");
      window.setTimeout(() => {
        if (editId && remunerationIds.has(editId)) lockRemunerationFields();
        else unlockRemunerationFields();
      }, 0);
    }, true);

    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (form.dataset.submitting === "true") return;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const mode = form.repeatMode.value; const method = form.dataset.method || "POST"; const submit = form.querySelector('[type="submit"]'); form.dataset.submitting = "true"; form.setAttribute("aria-busy", "true"); if (submit) submit.disabled = true; statusNode.textContent = "Salvando...";
      let shouldReload = false;
      try {
        let response;
        if (mode === "fixed" && method === "POST") {
          const item = payload(); response = await send("/api/recurrences", "POST", { frequency: form.frequency.value, interval: Math.max(1, Number(form.interval.value || 1)), startOn: item.plannedOn, endOn: form.endOn.value || undefined, amountMinor: item.amountMinor, description: item.description, kind: item.kind, accountId: item.accountId, destinationAccountId: item.destinationAccountId, categoryId: item.categoryId });
        } else if (mode === "installment" && method === "POST") {
          const data = new FormData(form); const item = payload(); response = await send("/api/installments", "POST", { accountId: String(data.get("accountId")), destinationAccountId: String(data.get("destinationAccountId") || "") || null, categoryId: String(data.get("categoryId") || "") || null, kind: String(data.get("kind")), status: String(data.get("status")), description: String(data.get("description") || "").trim(), note: String(data.get("note") || "").trim() || null, plannedOn: item.plannedOn, effectiveOn: item.effectiveOn, amountMinor: moneyToMinor(data.get("amountMinor")), amountMode: String(data.get("installmentValueMode") || "per_installment"), totalInstallments: Math.max(2, Number(data.get("installments") || 2)), initialSequenceNumber: Math.max(1, Number(data.get("installmentStart") || 1)), idempotencyKey: newIdempotencyKey() });
        } else response = await send(form.dataset.path || "/api/transactions", method, payload());
        statusNode.className = response.ok ? "form-status success full" : "form-status error full"; statusNode.textContent = await message(response); if (response.ok) { shouldReload = true; setTimeout(() => location.reload(), 350); }
      } catch { statusNode.className = "form-status error full"; statusNode.textContent = "Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente."; }
      finally { delete form.dataset.submitting; form.removeAttribute("aria-busy"); if (submit && !shouldReload) submit.disabled = false; }
    });

    document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => { if (button.dataset.confirm && !confirm(button.dataset.confirm)) return; const response = await send(button.dataset.path, button.dataset.method || "POST", button.dataset.payload ? JSON.parse(button.dataset.payload) : {}); if (response.ok) setTimeout(() => location.reload(), 300); }));

    const groupModal = document.querySelector("[data-group-modal]"); const groupForm = document.querySelector("[data-group-form]"); const selectionBar = document.querySelector("[data-selection-bar]"); const selectable = Array.from(document.querySelectorAll("[data-select-transaction]")); const groupOpen = document.querySelector("[data-group-open]");
    const selected = () => selectable.filter((input) => input.checked);
    const compatible = (items) => items.length >= 2 && /^[A-Z]{3}$/.test(items[0]?.dataset.currency || "") && items.every((item) => item.dataset.kind === items[0].dataset.kind && item.dataset.status === items[0].dataset.status && item.dataset.currency === items[0].dataset.currency);
    const syncSelection = () => { const items = selected(); selectionBar.hidden = items.length === 0; selectionBar.querySelector("[data-selection-count]").textContent = String(items.length); selectionBar.querySelector("[data-selection-total]").textContent = money(items.reduce((sum, item) => sum + Number(item.dataset.amount), 0), items[0]?.dataset.currency || statementCurrency); groupOpen.disabled = !compatible(items); };
    selectable.forEach((input) => input.addEventListener("change", syncSelection)); document.querySelector("[data-selection-clear]")?.addEventListener("click", () => { selectable.forEach((input) => input.checked = false); syncSelection(); }); document.querySelectorAll("[data-group-close]").forEach((button) => button.addEventListener("click", () => groupModal.close()));
    const safeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const memberMarkup = (item, currencyCode, original) => { const date = original ? (item.effectiveOn || item.plannedOn || item.occurredOn) : item.dataset.date; const description = original ? item.description : item.dataset.description; const category = original ? (item.categoryName || "Sem categoria") : item.dataset.category; const status = original ? item.status : item.dataset.status; const amount = original ? (item.kind === "expense" ? -1 : 1) * item.amountMinor : Number(item.dataset.amount); return "<div><span>" + [date, description, category, status].map(safeText).join(" · ") + "</span><strong>" + safeText(money(amount, currencyCode)) + "</strong></div>"; };
    groupOpen?.addEventListener("click", () => { const items = selected(); if (!compatible(items)) return; groupForm.reset(); groupForm.dataset.mode = "create"; groupForm.dataset.groupId = ""; groupForm.description.readOnly = false; groupForm.displayOn.readOnly = false; groupForm.displayOn.value = items.map((item) => item.dataset.date).sort().at(-1); groupForm.querySelector("[data-group-summary]").textContent = items[0].dataset.kind + " · " + items[0].dataset.status + " · " + items[0].dataset.currency + " · " + money(items.reduce((sum, item) => sum + Math.abs(Number(item.dataset.amount)), 0), items[0].dataset.currency); groupForm.querySelector("[data-group-members]").innerHTML = items.map((item) => memberMarkup(item, items[0].dataset.currency, false)).join(""); groupForm.querySelector('[type="submit"]').hidden = false; groupForm.querySelector("[data-group-ungroup]").hidden = true; document.querySelector("[data-group-title]").textContent = "Unificar lançamentos"; groupModal.showModal(); });
    document.querySelectorAll("[data-group]").forEach((node) => { const group = JSON.parse(node.textContent); document.querySelector('[data-group-details="' + group.id + '"]')?.addEventListener("click", () => { groupForm.reset(); groupForm.dataset.mode = "details"; groupForm.dataset.groupId = group.id; groupForm.description.value = group.description; groupForm.description.readOnly = true; groupForm.displayOn.value = group.displayOn; groupForm.displayOn.readOnly = true; groupForm.querySelector("[data-group-summary]").textContent = group.kind + " · " + group.status + " · " + group.currency + " · " + money(group.totalAmountMinor, group.currency); groupForm.querySelector("[data-group-members]").innerHTML = group.members.map((item) => memberMarkup(item, group.currency, true)).join(""); groupForm.querySelector('[type="submit"]').hidden = true; groupForm.querySelector("[data-group-ungroup]").hidden = false; document.querySelector("[data-group-title]").textContent = "Detalhes do grupo"; groupModal.showModal(); }); });
    groupForm?.addEventListener("submit", async (event) => { event.preventDefault(); const response = await send("/api/transaction-groups", "POST", { memberIds: selected().map((item) => item.value), description: groupForm.description.value, displayOn: groupForm.displayOn.value }); if (response.ok) location.reload(); else { const error = groupForm.querySelector("[data-group-error]"); error.textContent = await message(response); error.hidden = false; } });
    groupForm?.querySelector("[data-group-ungroup]")?.addEventListener("click", async () => { if (!confirm("Desagrupar estes lançamentos?")) return; const response = await send("/api/transaction-groups/" + groupForm.dataset.groupId, "DELETE", {}); if (response.ok) location.reload(); });
    syncFieldVisibility(); setStatus("posted");
  })();
  </script>`;
}

function renderShell(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/lancamentos",
    content,
    currentLabel: "Extrato bancário",
    styles: css(),
  });
}

function renderErrorPage(error: string): string {
  return renderShell(
    `<section class="panel"><p class="eyebrow">Erro ao carregar dados</p><h1>Lançamentos</h1><p class="error">${escapeHtml(error)}</p><a class="button-link" href="/lancamentos">Tentar novamente</a></section>`,
  );
}

function resolveAccountCurrency(account: AccountRecord | undefined): string | undefined {
  return normalizeCurrency(account?.currency);
}

function resolveTransactionCurrency(
  transaction: TransactionRecord,
  selectedAccountId: string | undefined,
  accountCurrency: string | undefined,
): string | undefined {
  if (
    transaction.kind === "transfer" &&
    selectedAccountId !== undefined &&
    transaction.destinationAccountId === selectedAccountId
  ) {
    return normalizeCurrency(transaction.destinationCurrency) ?? accountCurrency;
  }

  return (
    normalizeCurrency(transaction.group?.currency) ??
    normalizeCurrency(transaction.currency) ??
    accountCurrency
  );
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized ?? "") ? normalized : undefined;
}

function formatMoney(amountMinor: number, currency: string): string {
  return formatMinorCurrency(amountMinor, { currency });
}
function formatDate(value: string): string {
  return formatDateOnly(value);
}

const MONTH_ABBREVIATIONS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

/**
 * Compact movement date of the reference: day plus month. The machine-readable value stays in
 * the `datetime` attribute and the full date stays in `title`, so nothing is lost.
 */
function formatMovementDate(value: string): string {
  const month = Number(value.slice(5, 7));
  const day = value.slice(8, 10);
  const abbreviation = MONTH_ABBREVIATIONS[month - 1];
  return abbreviation ? `${day} ${abbreviation}` : formatDate(value);
}

function formatPercentage(value: number, maximumFractionDigits: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value)}%`;
}
const ROW_GLYPHS: Readonly<Record<string, string>> = {
  expense: '<path d="M6 6l8 8m0 0V7.5M14 14H7.5"/>',
  income: '<path d="M6 14 14 6m0 0H7.5M14 6v6.5"/>',
  transfer: '<path d="M4 8h9l-2.5-2.5M16 12H7l2.5 2.5"/>',
  food: '<path d="M4 6h12l-1 9a1.5 1.5 0 0 1-1.5 1.3H6.5A1.5 1.5 0 0 1 5 15Z"/><path d="M7.5 6V4.5M12.5 6V4.5"/>',
  health: '<path d="M10 16s-5.5-3.4-5.5-7A3 3 0 0 1 10 7a3 3 0 0 1 5.5 2c0 3.6-5.5 7-5.5 7Z"/>',
  transport:
    '<path d="M4.5 13V8l1.6-2.8A1 1 0 0 1 7 4.7h6a1 1 0 0 1 .9.5L15.5 8v5"/><path d="M4.5 13h11M6.5 13v1.4M13.5 13v1.4"/>',
  home: '<path d="M4 9.5 10 4.5l6 5V16H4Z"/><path d="M8.5 16v-3.5h3V16"/>',
  utility: '<path d="M11.5 3 5.5 11h3l-1 6 6-8h-3Z"/>',
  education:
    '<path d="M3.5 8 10 5l6.5 3-6.5 3Z"/><path d="M6 9.6V13c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6V9.6"/>',
  leisure: '<path d="M4 7.5h12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M7.5 7.5v-2h5v2"/>',
  incomeCategory: '<path d="M4 15V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8Z"/><path d="M8 11h4"/>',
  investment: '<path d="M4 15 8 10l3 2.5L16 6"/><path d="M16 6h-3.4M16 6v3.4"/>',
  tax: '<path d="M5 3.5h7L15.5 7v9.5h-11Z"/><path d="M11.8 3.6V7h3.4"/><path d="M7 11h6M7 14h4"/>',
  receipt:
    '<path d="M5 3.5h7L15.5 7v9.5h-11Z"/><path d="M11.8 3.6V7h3.4"/><path d="M7 11h6M7 14h4"/>',
};

const ROW_GLYPH_FALLBACK = '<path d="M6 6l8 8m0 0V7.5M14 14H7.5"/>';

const ROW_GLYPH_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/aliment|mercado|supermerc|restaurant|comida|padaria|cafe/i, "food"],
  [/saude|saúde|farmac|medic|médic|academia|esport|esporte|dentist/i, "health"],
  [/transporte|combust|posto|uber|carro|veic|passagem|pedagio|pedágio/i, "transport"],
  [/moradia|aluguel|condomin|casa|imovel|imóvel/i, "home"],
  [/luz|energia|agua|água|internet|telefone|celular|conta|gas|gás|utilidade/i, "utility"],
  [/educa|curso|escola|faculdade|livro|material/i, "education"],
  [/lazer|viagem|cinema|streaming|jogo|divers/i, "leisure"],
  [/salario|salário|renda|provento|pagamento|recebimento|holerite/i, "incomeCategory"],
  [/invest|poupanc|poupanç|rendimento|aplicac|aplicaç/i, "investment"],
  [/imposto|taxa|tarifa|tribut/i, "tax"],
];

/**
 * A decorative glyph for the movement row. It is derived from the category when one is present and
 * falls back to the movement direction, so no financial meaning is invented.
 */
function resolveRowGlyph(categoryName: string, kind: string): { key: string; html: string } {
  const match =
    categoryName && categoryName !== "Sem categoria"
      ? ROW_GLYPH_KEYWORDS.find(([pattern]) => pattern.test(categoryName))
      : undefined;
  const key = match
    ? match[1]
    : kind === "income"
      ? "income"
      : kind === "transfer"
        ? "transfer"
        : "expense";
  return { key, html: ROW_GLYPHS[key] ?? ROW_GLYPH_FALLBACK };
}

function renderRowGlyph(categoryName: string, kind: string): string {
  const glyph = resolveRowGlyph(categoryName, kind);
  return `<span class="col-row-icon" data-row-glyph="${escapeHtml(glyph.key)}" aria-hidden="true"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyph.html}</svg></span>`;
}

/**
 * The category chip leads with the movement direction, so the direction is readable before the word:
 * an up arrow for entries, a down arrow for exits and two stacked horizontal arrows for transfers.
 * The direction is decorative here (`aria-hidden`); the word and the row's own direction column
 * remain the accessible carriers of the information.
 */
type CategoryDirection = "in" | "out" | "transfer";

const CATEGORY_DIRECTION_GLYPHS: Record<CategoryDirection, string> = {
  in: '<path d="M10 16.5V4.5"/><path d="m5.5 9 4.5-4.5L14.5 9"/>',
  out: '<path d="M10 3.5v12"/><path d="m5.5 11 4.5 4.5L14.5 11"/>',
  transfer:
    '<path d="M3.5 7h11"/><path d="m11.5 4 3 3-3 3"/><path d="M16.5 13h-11"/><path d="m8.5 10-3 3 3 3"/>',
};

export function resolveCategoryDirection(kind: string): CategoryDirection {
  const normalized = (kind ?? "").toLowerCase();
  if (normalized === "income") return "in";
  if (normalized === "transfer") return "transfer";
  return "out";
}

function renderCategoryChip(categoryName: string, kind: string): string {
  const direction = resolveCategoryDirection(kind);
  const icon = `<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CATEGORY_DIRECTION_GLYPHS[direction]}</svg>`;
  return `<span class="col-category" data-category-direction="${direction}">${icon}<span class="col-category-label">${escapeHtml(categoryName)}</span></span>`;
}

/**
 * The reference prints the movement direction as an explicit sign, so an entry reads `+ R$ …` and an
 * exit reads `- R$ …` instead of relying on colour alone.
 */
function formatSignedAmount(amountMinor: number, currency: string): string {
  return `${amountMinor < 0 ? "-" : "+"} ${formatMoney(Math.abs(amountMinor), currency)}`;
}

function formatKind(kind: string): string {
  return kind === "income"
    ? "Entrada"
    : kind === "expense"
      ? "Saída"
      : kind === "transfer"
        ? "Transferência"
        : kind;
}
function resolveEvidenceLabel(transaction: TransactionRecord): string {
  return transaction.effectiveOn ? "Efetivo" : transaction.plannedOn ? "Previsto" : "Evento";
}
function emptyState(title: string, description: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}
function readNonEmpty(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeMerchantKey(value: string): string | undefined {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized.length < 3 ? undefined : normalized;
}
function isStatementSort(value: string | null | undefined): value is StatementSort {
  return (
    value === "date_asc" ||
    value === "date_desc" ||
    value === "amount_desc" ||
    value === "amount_asc" ||
    value === "description_asc" ||
    value === "description_desc"
  );
}
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function css(): string {
  return `${sharedShellStyles()}${statementListArchetypeStyles()}
    main { display:grid; gap:14px; margin:0 auto; max-width:1800px; min-width:0; padding:18px 20px; width:100%; }
    [hidden]{display:none!important}.warning{color:var(--warning);font-weight:600}
    .account-field[data-all-accounts]{grid-template-columns:minmax(0,1fr) 7rem}.account-field[data-all-accounts]>label#account-picker-label{grid-column:1;grid-row:1}.account-field[data-all-accounts]>.account-select{grid-column:1;grid-row:2}.statement-currency-field{align-content:end;display:grid;font-size:.75rem;gap:6px;grid-column:2;grid-row:1/3;min-width:0}.statement-currency-field select{background:var(--surface);border:1px solid var(--line);border-radius:10px;height:44px;min-width:0;padding:0 6px;width:100%}.statement-row-account{color:var(--muted);font-size:.75rem;font-weight:500;overflow-wrap:anywhere}
    .filter-form{align-items:end;display:grid;gap:10px;grid-template-columns:minmax(18rem,1.35fr) minmax(12rem,.75fr) minmax(12rem,1fr) minmax(11rem,.75fr) auto}
    .month-field,.account-field{display:grid;gap:6px;min-width:0}.account-select{min-width:0;position:relative}.account-select-trigger{align-items:center;background:var(--surface);border:1px solid var(--line);color:var(--text);display:flex;gap:8px;justify-content:flex-start;min-height:44px;min-width:0;padding:0 10px;text-align:left;width:100%}.account-select-text{flex:1;font-weight:650;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-select-icon{align-items:center;display:inline-flex;flex-shrink:0;height:20px;width:20px}.account-select-chevron{color:var(--muted);flex-shrink:0}.account-select-menu{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 12px 32px rgba(15,23,42,.14);left:0;list-style:none;margin:4px 0 0;max-height:260px;overflow-y:auto;padding:4px;position:absolute;right:0;top:100%;z-index:20}.account-select-menu li{align-items:center;border-radius:var(--radius);cursor:pointer;display:flex;font-size:.875rem;font-weight:600;gap:8px;padding:7px 8px}.account-select-menu li:hover,.account-select-menu li[aria-selected=true]{background:var(--primary-soft)}
    .month-nav{align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:4px;grid-template-columns:auto minmax(0,1fr) auto;padding:3px}.month-nav input{background:transparent;border:0;font-size:.875rem;min-height:34px;text-align:center}.icon-btn{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);color:var(--primary);min-height:34px;min-width:34px;padding:0}.ghost-btn{background:var(--surface);border:1px solid var(--line);color:var(--primary)}
    .statement-layout{align-items:start;display:grid;gap:12px;grid-template-columns:minmax(260px,320px) minmax(0,1fr)}.account-summary{display:grid;gap:12px;position:sticky;top:68px}.account-summary h2{font-size:.9375rem}.summary-balance{background:var(--primary-soft);border:1px solid #d4e6ec;border-radius:var(--radius);display:grid;gap:4px;padding:12px}.summary-balance span,.summary-total span{color:var(--muted);font-size:.6875rem;font-weight:700;text-transform:uppercase}.summary-balance strong,.summary-total strong,.status-line strong,.col-amount,.col-balance{font-variant-numeric:tabular-nums;overflow-wrap:normal;white-space:nowrap;word-break:normal}.summary-balance strong{font-size:1.125rem}.summary-balance p{color:var(--muted);font-size:.8125rem}.summary-totals{display:grid;gap:8px;grid-template-columns:1fr 1fr}.summary-total{border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:3px;min-width:0;padding:10px}.status-overview{border-top:1px solid var(--line);display:grid;gap:8px;padding-top:12px}.status-overview h3{font-size:.8125rem}.status-line{align-items:center;display:grid;gap:6px;grid-template-columns:auto minmax(0,1fr) auto}.status-line p{color:var(--muted);font-size:.8125rem;font-weight:600}.status-line strong{font-size:.8125rem}
    .statement-panel{overflow:hidden;padding:0}.statement-toolbar{align-items:center;border-bottom:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;padding:12px 14px}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{align-items:center;background:var(--primary-soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);display:inline-flex;gap:5px;font-size:.75rem;font-weight:700;padding:3px 9px;white-space:nowrap}.chip-pending{background:var(--warning-bg);border-color:#fde68a;color:var(--warning)}.chip-ok{background:var(--success-bg);border-color:#bbf7d0;color:var(--success)}.chip-posted{background:#e0f2fe;border-color:#bae6fd;color:#0369a1}
    .statement-table{display:grid;max-width:100%;overflow-x:auto}.statement-row{align-items:center;border-bottom:1px solid var(--line);display:grid;gap:8px;grid-template-columns:6rem minmax(8rem,1.3fr) minmax(7rem,.9fr) 7rem 4.5rem 8rem 8rem 3rem;min-width:70rem;padding:8px 12px;position:relative}.col-select{display:grid;left:3px;place-items:center;position:absolute}.statement-body .col-date{padding-left:14px}.col-select input{height:1.1rem;width:1.1rem}.grouped-row{background:color-mix(in srgb,var(--primary) 5%,transparent)}.group-indicator{color:var(--primary)}.statement-head{background:#f1f7fa;color:var(--muted);font-size:.6875rem;font-weight:700;text-transform:uppercase}.statement-head .col-amount,.statement-head .col-balance,.col-amount,.col-balance{text-align:right}.description{display:grid;gap:2px;min-width:0}.description>strong{overflow-wrap:anywhere}.description span{color:var(--muted);font-size:.8125rem}.credit{color:var(--success)!important}.debit{color:var(--danger)!important}
    .selection-bar{align-items:center;background:var(--surface);border:1px solid var(--primary);border-radius:var(--radius);bottom:16px;box-shadow:var(--shadow);display:flex;gap:12px;justify-content:flex-end;padding:10px 14px;position:sticky;z-index:8}.selection-bar[hidden]{display:none}dialog[data-group-modal]{max-width:min(760px,calc(100% - 32px));overflow:hidden}.group-modal-panel{gap:18px;max-width:760px;padding:22px}.group-modal-panel>header{align-items:start;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;padding-bottom:12px}.group-modal-panel form{display:grid;gap:12px 14px;grid-template-columns:repeat(2,minmax(0,1fr))}.group-readonly,.group-members,.group-modal-panel .save-row,.group-modal-panel .form-error{grid-column:1/-1}.group-readonly{color:var(--muted);font-size:.8125rem}.group-members{border:1px solid var(--line);border-left:0;border-radius:0;border-right:0;max-height:240px;overflow:auto}.group-members>div{align-items:center;border-bottom:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;padding:9px}.group-modal-panel .save-row{border-top:1px solid var(--line);margin-top:2px;padding-top:14px}
    .statement-status{align-items:center;border:1px solid currentColor;border-radius:999px;cursor:default;display:inline-flex;height:26px;justify-content:center;justify-self:start;padding:0;position:relative;width:26px}.statement-status-ok{background:var(--success-bg);color:var(--success)}.statement-status-posted{background:#e0f2fe;color:#0369a1}.statement-status-pending{background:var(--warning-bg);color:var(--warning)}.statement-status-planned{background:var(--primary-soft);color:var(--primary)}
    .actions{position:relative}.actions summary{align-items:center;background:var(--primary-soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);cursor:pointer;display:inline-flex;height:28px;justify-content:center;list-style:none;width:28px}.actions summary::-webkit-details-marker{display:none}.actions-menu{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 12px 32px rgba(15,23,42,.14);display:grid;gap:2px;max-width:220px;padding:4px;position:absolute;right:0;top:34px;width:max-content;z-index:50}.actions-item{align-items:center;background:transparent;border:0;border-radius:var(--radius);color:var(--text);display:flex;font-size:.8125rem;font-weight:600;gap:8px;justify-content:flex-start;min-height:32px;padding:0 8px;text-align:left;white-space:nowrap}.actions-item.danger{color:var(--danger)}.actions-divider{border:0;border-top:1px solid var(--line);margin:3px 2px}
    .statement-row.account-remuneration-row{border-left:3px solid var(--primary)}.statement-row.account-remuneration-row .col-description{min-width:15rem}.statement-row.account-remuneration-row .description{align-items:baseline;column-gap:4px;display:grid;grid-template-columns:max-content minmax(0,1fr);min-width:0}.statement-row.account-remuneration-row .description>strong{grid-column:1;grid-row:1;overflow-wrap:normal;white-space:nowrap}.account-remuneration-summary{color:var(--muted);display:block;font-size:.75rem;grid-column:1/-1;grid-row:2;line-height:1.35}.account-remuneration-audit{background:transparent;border:0;display:block;grid-column:2;grid-row:1;justify-self:start;margin:0;max-width:100%;min-width:0}.account-remuneration-audit[open]{grid-column:1/-1;grid-row:3;margin:4px 0 0}.account-remuneration-audit summary{align-items:center;color:var(--primary);cursor:pointer;display:inline-flex;font-size:.75rem;font-weight:700;line-height:1.2;list-style:none;padding:0;white-space:nowrap}.account-remuneration-audit summary::-webkit-details-marker{display:none}.account-remuneration-audit-content{background:var(--surface-soft);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:7px;margin-top:4px;padding:8px}.account-remuneration-adjustment{border-radius:999px;font-size:.6875rem;font-weight:800;padding:2px 7px}.account-remuneration-audit-content .account-remuneration-adjustment{background:var(--warning-bg);color:var(--warning);justify-self:start}.account-remuneration-audit-content dl{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr));margin:0}.account-remuneration-audit-content dl div{min-width:0}.account-remuneration-audit-content dt{color:var(--muted);font-size:.625rem;font-weight:700;text-transform:uppercase}.account-remuneration-audit-content dd{font-size:.75rem;font-weight:700;margin:0;overflow-wrap:anywhere}@media(max-width:760px){.account-remuneration-audit-content dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
    .empty{background:var(--bg);border:1px dashed var(--line);border-radius:var(--radius-lg);display:grid;gap:4px;margin:14px;padding:14px}dialog{border:0;border-radius:var(--radius-lg);box-shadow:0 24px 80px rgba(15,23,42,.24);max-width:min(860px,calc(100% - 32px));padding:0;width:100%}dialog[data-modal]{box-sizing:border-box;inset:0;margin:auto;height:fit-content;max-height:calc(100dvh - 32px);max-width:min(860px,calc(100vw - 32px));overflow:hidden;position:fixed;transform:none}dialog::backdrop{background:rgba(6,25,35,.48)}.modal-panel{display:grid;gap:14px;max-width:100%;min-width:0;padding:18px;width:100%}dialog[data-modal]>.modal-panel{box-sizing:border-box;max-height:inherit;overflow-y:auto;overscroll-behavior:contain}.close-form{display:flex;justify-content:flex-end}.modal-panel form[data-form]{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr));max-width:100%;min-width:0;width:100%}.modal-panel form[data-form]>*{max-width:100%;min-width:0}.modal-panel form[data-form] label{min-width:0}.modal-panel form[data-form] input,.modal-panel form[data-form] select,.modal-panel form[data-form] textarea,.modal-panel form[data-form] output{max-width:100%;min-width:0}.modal-panel form[data-form] output,.modal-panel form[data-form] .muted{overflow-wrap:anywhere}.full,.modal-panel button[type=submit],.modal-panel form[data-form] p{grid-column:1/-1}.modal-panel form[data-form] label{align-content:start}.modal-panel form[data-form] .field-label{display:block;min-width:0}.modal-panel form[data-form] .nowrap{white-space:nowrap}.modal-panel form[data-form] input[readonly]{background:var(--bg);color:var(--text);cursor:default}.modal-panel form[data-form] .rate-value{align-items:center;border:1px dashed var(--line);border-radius:var(--radius);display:flex;flex-wrap:wrap;gap:2px 8px;min-height:var(--sf-density-control-min-height);padding:0 var(--sf-density-control-padding-inline)}.save-row{align-items:center;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between}.status-icons{align-items:center;display:flex;gap:6px}.status-icon-btn{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:999px;color:var(--muted);display:inline-flex;height:32px;justify-content:center;min-height:0;padding:0;width:32px}.status-icon-btn[data-status-option=posted].active{background:#e0f2fe;color:#0369a1}.status-icon-btn[data-status-option=reconciled].active{background:var(--success-bg);color:var(--success)}.status-icon-btn[data-status-option=planned].active{background:var(--warning-bg);color:var(--warning)}.status-label{color:var(--muted);font-size:.75rem;font-weight:600}
    @media(max-width:1279px){.statement-layout{grid-template-columns:1fr}.account-summary{position:static}.summary-totals{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-form{grid-template-columns:minmax(18rem,1.25fr) minmax(12rem,.75fr)}}
    @media(max-width:1100px){.statement-filter-actions{grid-column:1/-1}.modal-panel form[data-form]{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(min-width:761px) and (max-width:900px){.filter-form{grid-template-columns:minmax(0,1fr)}.statement-filter-actions{grid-column:1}}
    @media(max-width:760px){main{padding:14px 14px 24px}.filter-form,.modal-panel form[data-form],.group-modal-panel form,.summary-totals{grid-template-columns:1fr}.statement-filter-actions{align-items:stretch;display:grid}.statement-toolbar{align-items:stretch;display:grid}.save-row{align-items:stretch;flex-direction:column}.statement-table{overflow-x:visible}.statement-head{display:none}.statement-row.statement-body{align-items:center;display:flex;flex-wrap:wrap;gap:5px 8px;min-width:0;padding:10px}.statement-row.statement-body .col-select{left:auto;order:1;position:static}.statement-row.statement-body .col-date{color:var(--muted);flex:0 0 auto;font-size:.75rem;order:1;padding-left:0}.statement-row.statement-body .col-actions{margin-left:auto;order:2}.statement-row.statement-body .col-description{flex:1 1 100%;order:3}.statement-row.statement-body .col-category,.statement-row.statement-body .col-kind{color:var(--muted);font-size:.75rem;order:4}.statement-row.statement-body .col-status{order:5}.statement-row.statement-body .col-amount{font-size:.9375rem;margin-left:auto;order:6}.statement-row.statement-body .col-balance{color:var(--muted);font-size:.75rem;order:7}.statement-date-group{position:sticky;top:0;z-index:2}}
    ${recurrencesSectionStyles()}`;
}
