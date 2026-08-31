import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
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
import {
  buildRows,
  buildTransactionQuery,
  calculateOpeningBalance,
  filterStatementPeriodTransactions,
  isAccountStatementTransaction,
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
}

export async function renderTransactionsPageV2(token: string, url?: URL): Promise<string> {
  const [accountsResult, categoriesResult] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

  if (!accountsResult.ok) return renderErrorPage(accountsResult.error);

  const accounts = accountsResult.data.accounts.filter((account) => account.status === "active");
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];
  const filters = resolveFilters(url, accounts);
  const selectedAccount = accounts.find((account) => account.id === filters.accountId);
  const currency = resolveAccountCurrency(selectedAccount);
  const presentation = resolvePresentation(url);

  // Recurrences are fetched first because the API materializes due occurrences as transactions.
  const recurrencesResult = selectedAccount
    ? await apiGet<{ recurrences: RecurrenceRecord[] }>(
        token,
        `/api/recurrences?accountId=${encodeURIComponent(selectedAccount.id)}&status=all`,
      )
    : { ok: true as const, data: { recurrences: [] as RecurrenceRecord[] } };
  const recurrences = recurrencesResult.ok ? recurrencesResult.data.recurrences : [];

  const [transactionResult, groupsResult] = filters.accountId
    ? await Promise.all([
        apiGet<{ transactions: TransactionRecord[] }>(
          token,
          `/api/transactions?${buildTransactionQuery(filters)}`,
        ),
        apiGet<{ groups: TransactionGroupRecord[] }>(
          token,
          `/api/transaction-groups?accountId=${encodeURIComponent(filters.accountId)}&startsOn=1900-01-01&endsOn=${filters.endsOn}`,
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
  const openingMinor = calculateOpeningBalance(transactions, selectedAccount, filters.startsOn);
  const canonicalRows = buildRows(
    filterStatementPeriodTransactions(transactions, filters),
    selectedAccount,
    openingMinor,
  );
  const summary = summarize(canonicalRows, openingMinor);
  const visibleRows = sortRows(
    filterRowsForPresentation(canonicalRows, categories, presentation),
    presentation.sort,
  );

  const actionsHtml = renderQuickActions(selectedAccount);
  const filtersHtml = renderFilters(
    accounts,
    selectedAccount,
    filters.accountId,
    filters.month,
    presentation,
    url,
  );
  const contextHtml = renderStatementContext(
    selectedAccount,
    currency,
    filters.startsOn,
    filters.endsOn,
  );
  const statusHtml = renderInsightContext(presentation);
  const summaryHtml = renderSummaryPanel(summary, selectedAccount, currency);
  const listHtml = renderStatementList(
    visibleRows,
    selectedAccount,
    accounts,
    categories,
    recurrences,
    summary,
    currency,
    presentation.sort,
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
    ${renderRecurrenceEditModal(categories, "account")}
    ${clientScript(currency)}
    ${recurrencesSectionScript()}
  `);
}

function resolvePresentation(url: URL | undefined): StatementPresentation {
  const rawSort = url?.searchParams.get("sort");
  const sort: StatementSort = isStatementSort(rawSort) ? rawSort : "date_asc";
  return {
    search: (url?.searchParams.get("q") ?? "").trim().slice(0, 120),
    sort,
    ...(readNonEmpty(url?.searchParams.get("categoryId"))
      ? { insightCategoryId: readNonEmpty(url?.searchParams.get("categoryId")) }
      : {}),
    ...(normalizeMerchantKey(url?.searchParams.get("merchantKey") ?? "")
      ? { insightMerchantKey: normalizeMerchantKey(url?.searchParams.get("merchantKey") ?? "") }
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
): string {
  const preserved = [
    "profileId",
    "currency",
    "kind",
    "evidence",
    "day",
    "categoryId",
    "merchantKey",
  ]
    .map((name) => {
      const value = url?.searchParams.get(name);
      return value ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : "";
    })
    .join("");

  return `<form class="filter-form" method="get" action="/lancamentos" data-auto-submit>
    ${preserved}
    ${renderAccountPicker(accounts, selectedAccount, selectedId)}
    <div class="month-field">
      <label for="filter-month">Mês</label>
      <div class="month-nav">
        <button type="button" class="icon-btn" data-month-step="-1" aria-label="Mês anterior">&#8249;</button>
        <input id="filter-month" name="month" type="month" value="${escapeHtml(month)}" required />
        <button type="button" class="icon-btn" data-month-step="1" aria-label="Próximo mês">&#8250;</button>
      </div>
    </div>
    <label class="statement-search-field" for="statement-search">Buscar
      <input id="statement-search" name="q" type="search" value="${escapeHtml(presentation.search)}" placeholder="Descrição ou categoria" autocomplete="off" />
    </label>
    <label class="statement-sort-field" for="statement-sort">Ordenar
      <select id="statement-sort" name="sort">${renderSortOptions(presentation.sort)}</select>
    </label>
    <div class="statement-filter-actions">
      <button type="submit">Aplicar</button>
      <button type="button" class="ghost-btn" data-month-current>Mês atual</button>
      <a class="button-link secondary-button" href="/lancamentos${selectedId ? `?accountId=${encodeURIComponent(selectedId)}&month=${encodeURIComponent(month)}` : ""}">Limpar filtros</a>
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
): string {
  if (!selectedAccount) {
    return `<section class="statement-context" role="status"><div class="statement-context-copy"><strong>Selecione uma conta</strong><span class="muted">O extrato, os saldos e os lançamentos são sempre apresentados no contexto de uma conta.</span></div></section>`;
  }
  const institution = findInstitution(selectedAccount.institutionKey);
  return `<section class="statement-context" aria-label="Contexto financeiro atual">
    <div class="statement-context-main">
      <span class="account-select-icon">${renderInstitutionIcon(institution.key)}</span>
      <div class="statement-context-copy"><span class="muted">Conta atual</span><strong>${escapeHtml(selectedAccount.name)}</strong></div>
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
        )
      : emptyState(
          selectedAccount ? "Nenhum lançamento neste recorte." : "Selecione uma conta.",
          selectedAccount
            ? "Altere o período ou os filtros, ou crie um lançamento para acompanhar a movimentação."
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
      return `${separator}${renderRow(row, selectedAccount, accounts, categories, recurrences, currency)}`;
    })
    .join("");
}

function renderTableHeader(): string {
  return `<div class="statement-row statement-head" role="row"><span class="col-select" aria-hidden="true"></span><span class="col-date">Data</span><span class="col-description">Histórico</span><span class="col-category">Categoria</span><span class="col-kind">Tipo</span><span class="col-status">Situação</span><span class="col-amount">Valor</span><span class="col-balance">Saldo</span><span class="col-actions">Ações</span></div>`;
}

function renderRow(
  row: StatementRow,
  selectedAccount: AccountRecord | undefined,
  accounts: readonly AccountRecord[],
  categories: readonly CategoryRecord[],
  recurrences: readonly RecurrenceRecord[],
  accountCurrency: string | undefined,
): string {
  const { transaction } = row;
  const currency = resolveTransactionCurrency(transaction, accountCurrency);
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
    Boolean(currency) &&
    (transaction.kind === "income" || transaction.kind === "expense") &&
    transaction.status !== "suggested" &&
    transaction.status !== "voided" &&
    !transaction.cardId &&
    !transaction.invoiceId &&
    !transaction.transactionGroupId;

  return `<article class="statement-row statement-body${transaction.accountRemuneration ? " account-remuneration-row" : ""}" role="row">
    <label class="col-select"><input type="checkbox" data-select-transaction value="${escapeHtml(transaction.id)}" data-kind="${escapeHtml(transaction.kind)}" data-status="${escapeHtml(transaction.status)}" data-currency="${escapeHtml(currency ?? "")}" data-amount="${row.amountMinor}" data-date="${escapeHtml(date)}" data-description="${escapeHtml(transaction.description)}" data-category="${escapeHtml(categoryName)}" aria-label="Selecionar lançamento ${escapeHtml(transaction.description || "sem descrição")}"${eligible ? "" : " disabled"}></label>
    <time class="col-date" datetime="${escapeHtml(date)}">${formatDate(date)}</time>
    <div class="description col-description"><strong>${escapeHtml(transaction.description || "(sem descrição)")}${transaction.recurrenceId ? renderRecurrenceIndicator() : ""}${transaction.accountRemuneration ? '<span class="account-remuneration-badge">Remuneração CDI</span>' : ""}</strong>${renderTransferNote(transaction, selectedAccount, accounts)}${renderAccountRemunerationAudit(transaction)}</div>
    <span class="col-category">${escapeHtml(categoryName)}</span><span class="col-kind">${escapeHtml(formatKind(transaction.kind))}</span>
    ${renderStatementStatus(transaction)}
    <strong class="col-amount ${row.amountMinor < 0 ? "debit" : "credit"}">${currency ? formatMoney(row.amountMinor, currency) : "Moeda indisponível"}</strong>
    <strong class="col-balance${row.balanceAfterMinor < 0 ? " debit" : ""}" data-balance-minor="${row.balanceAfterMinor}">${currency ? formatMoney(row.balanceAfterMinor, currency) : "Moeda indisponível"}</strong>
    <details class="actions col-actions"><summary aria-label="Ações do lançamento ${escapeHtml(transaction.description || "sem descrição")}">${renderDotsIcon()}</summary><div class="actions-menu" role="menu">
      <button type="button" class="actions-item" data-edit="${escapeHtml(transaction.id)}">${renderEditIcon()}<span>Editar</span></button>
      <button type="button" class="actions-item" data-action data-method="PATCH" data-path="/api/transactions/${escapeHtml(transaction.id)}" data-payload='${escapeHtml(JSON.stringify({ status: nextStatus }))}'>${renderReconcileIcon(transaction.status === "reconciled")}<span>${transaction.status === "reconciled" ? "Desconciliar" : "Marcar como conciliado"}</span></button>
      <button type="button" class="actions-item" data-clone="${escapeHtml(transaction.id)}">${renderCloneIcon()}<span>Clonar</span></button><hr class="actions-divider" />
      <button type="button" class="actions-item danger" data-action data-method="POST" data-path="/api/transactions/${escapeHtml(transaction.id)}/void" data-confirm="${escapeHtml(transaction.status === "reconciled" ? "Este lançamento já está conciliado. Excluir mesmo assim?" : "Excluir este lançamento?")}">${renderTrashIcon()}<span>Excluir</span></button>
      ${recurrence ? renderRecurrenceActionMenuItems(recurrence) : ""}
    </div></details>
    <script type="application/json" data-transaction="${escapeHtml(transaction.id)}">${serializeScriptJson(transaction)}</script>
  </article>`;
}

function renderGroupRow(
  row: StatementRow,
  group: TransactionGroupRecord,
  currency: string | undefined,
): string {
  return `<article class="statement-row statement-body grouped-row" role="row" data-group-row="${escapeHtml(group.id)}">
    <span class="col-select group-indicator" aria-label="Grupo de lançamentos">&#128279;</span>
    <time class="col-date" datetime="${escapeHtml(group.displayOn)}">${formatDate(group.displayOn)}</time>
    <div class="description col-description"><strong>${escapeHtml(group.description)}</strong><span>${group.members.length} lançamentos agrupados</span></div>
    <span class="col-category">Várias categorias</span><span class="col-kind">${escapeHtml(formatKind(group.kind))}</span>${renderStatementStatus(row.transaction)}
    <strong class="col-amount ${row.amountMinor < 0 ? "debit" : "credit"}">${currency ? formatMoney(row.amountMinor, currency) : "Moeda indisponível"}</strong>
    <strong class="col-balance${row.balanceAfterMinor < 0 ? " debit" : ""}" data-balance-minor="${row.balanceAfterMinor}">${currency ? formatMoney(row.balanceAfterMinor, currency) : "Moeda indisponível"}</strong>
    <button type="button" class="icon-btn col-actions" data-group-details="${escapeHtml(group.id)}" aria-label="Ver lançamentos do grupo">${renderDotsIcon()}</button>
    <script type="application/json" data-group="${escapeHtml(group.id)}">${serializeScriptJson(group)}</script>
  </article>`;
}

export function renderAccountRemunerationAudit(transaction: TransactionRecord): string {
  const remuneration = transaction.accountRemuneration;
  if (!remuneration) return "";
  return `<details class="account-remuneration-audit" aria-label="Memória do cálculo da remuneração"><summary>Ver memória do cálculo</summary><div class="account-remuneration-audit-heading"><strong>Memória do cálculo</strong><span class="account-remuneration-adjustment ${remuneration.manuallyAdjusted ? "adjusted" : "original"}">${remuneration.manuallyAdjusted ? "Ajustado manualmente" : "Valor original"}</span></div><dl><div><dt>Competência</dt><dd>${formatDate(remuneration.competenceOn)}</dd></div><div><dt>Saldo-base</dt><dd>${formatMoney(remuneration.balanceBaseMinor, "BRL")}</dd></div><div><dt>CDI diário</dt><dd>${formatPercentage(remuneration.dailyRatePercent, 8)}</dd></div><div><dt>Percentual aplicado</dt><dd>${formatPercentage(remuneration.remunerationPercent, 4)}</dd></div><div><dt>Valor original</dt><dd>${formatMoney(remuneration.originalAmountMinor, "BRL")}</dd></div></dl></details>`;
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
): string {
  const money = (value: number) => (currency ? formatMoney(value, currency) : "Moeda indisponível");
  return `<aside class="panel account-summary" aria-label="Resumo da conta"><div><p class="eyebrow">Resumo da Conta</p><h2>${escapeHtml(selectedAccount?.name ?? "Selecione uma conta")}</h2>${currency ? `<span class="statement-context-pill" data-context="summary-currency">${escapeHtml(currency)}</span>` : ""}</div><section class="summary-balance"><span>Saldo atual</span><strong class="${summary.effectiveBalanceMinor < 0 ? "debit" : "credit"}">${money(summary.effectiveBalanceMinor)}</strong><p>Saldo efetivo com lançamentos realizados.</p></section><div class="summary-totals">${summaryTotal("Receitas", summary.incomeMinor, "credit", currency)}${summaryTotal("Despesas", -summary.expenseMinor, "debit", currency)}</div><section class="status-overview" aria-label="Status dos lançamentos"><h3>Status</h3>${statusLine("Conciliados", summary.reconciledCount, summary.reconciledMinor, "ok", currency)}${statusLine("Não conciliados", summary.unreconciledCount, summary.unreconciledMinor, "posted", currency)}${statusLine("Pendentes", summary.pendingCount, summary.pendingMinor, "pending", currency)}</section></aside>`;
}

function summaryTotal(
  label: string,
  amountMinor: number,
  tone: string,
  currency: string | undefined,
): string {
  return `<div class="summary-total"><span>${escapeHtml(label)}</span><strong class="${tone}">${currency ? formatMoney(amountMinor, currency) : "Moeda indisponível"}</strong></div>`;
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
): string {
  const triggerIcon = selectedAccount
    ? renderInstitutionIcon(findInstitution(selectedAccount.institutionKey).key)
    : renderInstitutionIcon("");
  return `<div class="account-field" data-account-picker><label id="account-picker-label">Conta</label><div class="account-select"><button type="button" class="account-select-trigger" data-account-trigger aria-haspopup="listbox" aria-expanded="false" aria-labelledby="account-picker-label"><span class="account-select-icon">${triggerIcon}</span><span class="account-select-text">${selectedAccount ? `${escapeHtml(selectedAccount.name)} · ${escapeHtml(resolveAccountCurrency(selectedAccount) ?? "Moeda indisponível")}` : "Selecione uma conta"}</span><svg class="account-select-chevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><input type="hidden" name="accountId" value="${escapeHtml(selectedId ?? "")}" required data-account-input /><ul class="account-select-menu" role="listbox" hidden data-account-menu aria-labelledby="account-picker-label">${accounts.map((account) => renderAccountOption(account, selectedId)).join("")}</ul></div></div>`;
}

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
  return `<dialog data-modal><section class="modal-panel"><form method="dialog" class="close-form"><button type="submit">Fechar</button></form><div><p class="eyebrow">Lançamento da conta</p><h2 data-modal-title>${selectedAccount ? `Novo lançamento em ${escapeHtml(selectedAccount.name)}` : "Selecione uma conta"}</h2><p class="muted">Conta e moeda vêm do contexto principal.</p></div><form data-form data-path="/api/transactions"><input name="accountId" type="hidden" value="${escapeHtml(selectedAccount?.id ?? "")}" /><label>Tipo<select name="kind" required>${renderKindOptions()}</select></label><label>Valor (${escapeHtml(currency ?? "moeda indisponível")})<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label><label data-field="occurredOn">Data do evento<input name="occurredOn" type="date" required /></label><label>Data prevista<input name="plannedOn" type="date" required /></label><label>Data efetiva<input name="effectiveOn" type="date" /></label><label>Categoria<select name="categoryId" data-category-select><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label><label data-field="destinationAccountId">Conta destino<select name="destinationAccountId"><option value="">Apenas transferência</option>${renderAccountOptions(accounts)}</select></label><label>Repetição<select name="repeatMode"><option value="single">Único</option><option value="installment">Parcelado</option><option value="fixed" data-repeat-option="fixed">Fixo</option></select></label><label data-field="installments">Parcelas<input name="installments" type="number" min="2" max="60" value="2" /></label><label data-field="installmentStart">Parcela inicial<input name="installmentStart" type="number" min="1" max="60" value="1" /></label><label data-field="installmentValueMode">Valor informado<select name="installmentValueMode"><option value="per_installment">Valor da parcela</option><option value="total">Valor total (dividir pelas parcelas)</option></select></label><label data-field="interval">A cada<input name="interval" type="number" min="1" max="60" value="1" /></label><label data-field="frequency">Frequência<select name="frequency"><option value="daily">Dia(s)</option><option value="weekly">Semana(s)</option><option value="monthly" selected>Mês(es)</option><option value="yearly">Ano(s)</option></select></label><label data-field="endOn">Fim opcional<input name="endOn" type="date" /></label><label class="full">Descrição<input name="description" maxlength="240" required /></label><label class="full">Observação<textarea name="note" rows="3"></textarea></label><input type="hidden" name="status" value="posted" /><div class="full save-row"><div class="status-icons" role="radiogroup" aria-label="Situação do lançamento">${renderStatusIcon("posted", "Efetivado não conciliado", '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/>')}${renderStatusIcon("reconciled", "Conciliado", '<path d="M4 10l4 4 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')}${renderStatusIcon("planned", "Previsto/pendente", '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')}<span class="status-label" data-status-label>Efetivado não conciliado</span></div><button type="submit"${selectedAccount && currency ? "" : " disabled"}>Salvar lançamento</button></div></form></section></dialog>`;
}

function renderGroupModal(
  selectedAccount: AccountRecord | undefined,
  currency: string | undefined,
): string {
  return `<dialog class="modal" data-group-modal><section class="modal-panel group-modal-panel"><header><div><p class="eyebrow">Agrupamento</p><h2 data-group-title>Unificar lançamentos</h2></div><button type="button" class="icon-btn" data-group-close aria-label="Fechar">&times;</button></header><form data-group-form><label>Descrição do grupo<input name="description" maxlength="240" required></label><label>Data de exibição<input name="displayOn" type="date" required></label><label>Conta<input value="${escapeHtml(selectedAccount?.name ?? "")}" readonly></label><label>Moeda<input value="${escapeHtml(currency ?? "Moeda indisponível")}" readonly></label><div class="group-readonly" data-group-summary></div><div class="group-members" data-group-members></div><p class="form-error" data-group-error hidden></p><div class="save-row"><button type="button" class="ghost-btn" data-group-close>Cancelar</button><button type="submit">Unificar</button><button type="button" class="danger" data-group-ungroup hidden>Desagrupar lançamentos</button></div></form></section></dialog>`;
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
  const childrenByParent = new Map<string | undefined, CategoryRecord[]>();
  for (const category of categories)
    childrenByParent.set(category.parentCategoryId, [
      ...(childrenByParent.get(category.parentCategoryId) ?? []),
      category,
    ]);
  const rows: { category: CategoryRecord; depth: number }[] = [];
  const walk = (parentId: string | undefined, depth: number): void => {
    for (const category of childrenByParent.get(parentId) ?? []) {
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(undefined, 0);
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
        `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(resolveAccountCurrency(account) ?? "moeda indisponível")}</option>`,
    )
    .join("");
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

function clientScript(currency: string | undefined): string {
  return String.raw`<script data-statement-a2-runtime="true">
  (() => {
    const statementCurrency = ${JSON.stringify(currency ?? "")};
    const modal = document.querySelector("[data-modal]");
    const form = document.querySelector("[data-form]");
    if (!form || !modal) return;
    const statusNode = document.createElement("p");
    statusNode.className = "form-status muted full";
    statusNode.setAttribute("aria-live", "polite");
    form.appendChild(statusNode);

    const moneyToMinor = (value) => Math.round(parseFloat(String(value).replace(/\./g, "").replace(",", ".") || "0") * 100);
    const minorToMoneyInput = (amountMinor) => (amountMinor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const money = (minor, currencyCode) => /^[A-Z]{3}$/.test(currencyCode || "") ? (Number(minor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: currencyCode }) : "Moeda indisponível";
    const moneyInput = form.querySelector("[data-money]");
    moneyInput?.addEventListener("input", () => { const digits = moneyInput.value.replace(/\D/g, ""); moneyInput.value = minorToMoneyInput(digits ? parseInt(digits, 10) : 0); });

    const setFieldVisible = (name, visible) => { const field = form.querySelector('[data-field="' + name + '"]'); if (field) field.hidden = !visible; };
    const syncCategoryOptions = () => {
      const select = form.querySelector("[data-category-select]"); if (!select) return;
      let selectedHidden = false;
      Array.from(select.options).forEach((option) => { if (!option.dataset.kind) return; const visible = option.dataset.kind === form.kind.value; option.hidden = !visible; if (!visible && option.selected) selectedHidden = true; });
      if (selectedHidden) select.value = "";
    };
    const syncFieldVisibility = () => {
      const kind = form.kind.value;
      const fixedOption = form.repeatMode.querySelector('[data-repeat-option="fixed"]');
      if (fixedOption) fixedOption.disabled = kind === "transfer";
      if (kind === "transfer" && form.repeatMode.value === "fixed") form.repeatMode.value = "single";
      const repeatMode = form.repeatMode.value;
      const usesGenericTemporalFields = repeatMode === "single" || form.dataset.method === "PATCH";
      setFieldVisible("occurredOn", usesGenericTemporalFields); form.occurredOn.required = usesGenericTemporalFields;
      setFieldVisible("destinationAccountId", kind === "transfer");
      ["installments", "installmentStart", "installmentValueMode"].forEach((name) => setFieldVisible(name, repeatMode === "installment"));
      ["interval", "frequency", "endOn"].forEach((name) => setFieldVisible(name, repeatMode === "fixed"));
      syncCategoryOptions();
    };
    form.addEventListener("change", (event) => { if (event.target.name === "kind" || event.target.name === "repeatMode") syncFieldVisibility(); });

    const statusButtons = Array.from(form.querySelectorAll("[data-status-option]"));
    const statusLabel = form.querySelector("[data-status-label]");
    const setStatus = (value) => { form.status.value = value; statusButtons.forEach((button) => { const active = button.dataset.statusOption === value; button.classList.toggle("active", active); if (active && statusLabel) statusLabel.textContent = button.dataset.statusLabelText; }); };
    statusButtons.forEach((button) => button.addEventListener("click", () => setStatus(button.dataset.statusOption)));

    const addMonths = (dateValue, months) => { const date = new Date(dateValue + "T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString().slice(0, 10); };
    const shiftMonth = (monthValue, steps) => { const [year, month] = monthValue.split("-").map(Number); return new Date(Date.UTC(year, month - 1 + steps, 1)).toISOString().slice(0, 7); };
    const monthInput = document.querySelector("#filter-month");
    document.querySelectorAll("[data-month-step]").forEach((button) => button.addEventListener("click", () => { monthInput.value = shiftMonth(monthInput.value, Number(button.dataset.monthStep)); monthInput.closest("form").requestSubmit(); }));
    document.querySelectorAll("[data-month-current]").forEach((button) => button.addEventListener("click", () => { monthInput.value = new Date().toISOString().slice(0, 7); monthInput.closest("form").requestSubmit(); }));
    document.querySelectorAll("[data-auto-submit]").forEach((autoForm) => autoForm.addEventListener("change", (event) => { if (event.target.name === "accountId" || event.target.name === "month" || event.target.name === "sort") autoForm.requestSubmit(); }));

    const accountPicker = document.querySelector("[data-account-picker]");
    if (accountPicker) {
      const trigger = accountPicker.querySelector("[data-account-trigger]"); const menu = accountPicker.querySelector("[data-account-menu]"); const input = accountPicker.querySelector("[data-account-input]");
      const close = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
      trigger.addEventListener("click", () => { menu.hidden = !menu.hidden; trigger.setAttribute("aria-expanded", String(!menu.hidden)); });
      menu.querySelectorAll("[data-account-option]").forEach((option) => option.addEventListener("click", () => { input.value = option.dataset.accountOption; close(); input.dispatchEvent(new Event("change", { bubbles: true })); }));
      document.addEventListener("click", (event) => { if (!accountPicker.contains(event.target)) close(); });
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    }

    const withActiveProfile = (path) => { const profileId = new URL(location.href).searchParams.get("profileId"); if (!profileId) return path; return path + (path.includes("?") ? "&" : "?") + "profileId=" + encodeURIComponent(profileId); };
    const send = (path, method, body) => fetch(withActiveProfile(path), { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const message = async (response) => { const body = await response.json().catch(() => ({})); return response.ok ? "Ação concluída. Atualizando..." : ((body.error && body.error.message) || "Não foi possível concluir a ação."); };

    const basePayload = (plannedOn, effectiveOn, amountMinor, description) => {
      const data = new FormData(form);
      const result = { kind: String(data.get("kind")), amountMinor, occurredOn: String(data.get("occurredOn")), plannedOn, effectiveOn: effectiveOn || null, accountId: String(data.get("accountId")), description, status: String(data.get("status")) };
      const destinationAccountId = String(data.get("destinationAccountId") || ""); const categoryId = String(data.get("categoryId") || ""); const note = String(data.get("note") || "").trim();
      if (destinationAccountId) result.destinationAccountId = destinationAccountId; if (categoryId) result.categoryId = categoryId; if (note) result.note = note; return result;
    };
    const payload = () => { const data = new FormData(form); return basePayload(String(data.get("plannedOn")), String(data.get("effectiveOn") || ""), moneyToMinor(data.get("amountMinor")), String(data.get("description") || "")); };
    const newIdempotencyKey = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);

    document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => { if (button.disabled) return; form.reset(); form.dataset.path = "/api/transactions"; form.dataset.method = "POST"; if (button.dataset.quickKind) form.kind.value = button.dataset.quickKind; setStatus("posted"); syncFieldVisibility(); modal.showModal(); }));
    document.querySelectorAll("[data-transaction]").forEach((node) => {
      const transaction = JSON.parse(node.textContent);
      const hydrate = (selector, clone) => { const button = document.querySelector(selector + transaction.id + '"]'); if (!button) return; button.addEventListener("click", () => { form.reset(); form.dataset.path = clone ? "/api/transactions" : "/api/transactions/" + transaction.id; form.dataset.method = clone ? "POST" : "PATCH"; form.kind.value = transaction.kind; form.amountMinor.value = minorToMoneyInput(transaction.amountMinor); form.occurredOn.value = transaction.occurredOn; form.plannedOn.value = transaction.plannedOn || transaction.occurredOn; form.effectiveOn.value = transaction.effectiveOn || ""; setStatus(transaction.status === "reconciled" ? "reconciled" : transaction.effectiveOn ? "posted" : "planned"); form.destinationAccountId.value = transaction.destinationAccountId || ""; form.categoryId.value = transaction.categoryId || ""; form.description.value = clone ? "Cópia de " + transaction.description : transaction.description; document.querySelector("[data-modal-title]").textContent = clone ? "Clonar lançamento" : "Editar lançamento"; syncFieldVisibility(); modal.showModal(); }); };
      hydrate('[data-edit="', false); hydrate('[data-clone="', true);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (form.dataset.submitting === "true") return;
      const mode = form.repeatMode.value; const method = form.dataset.method || "POST"; const submit = form.querySelector('[type="submit"]'); form.dataset.submitting = "true"; form.setAttribute("aria-busy", "true"); if (submit) submit.disabled = true; statusNode.textContent = "Salvando...";
      try {
        let response;
        if (mode === "fixed" && method === "POST") {
          const item = payload(); response = await send("/api/recurrences", "POST", { frequency: form.frequency.value, interval: Math.max(1, Number(form.interval.value || 1)), startOn: form.plannedOn.value, endOn: form.endOn.value || undefined, amountMinor: item.amountMinor, description: item.description, kind: item.kind, accountId: item.accountId, categoryId: item.categoryId });
        } else if (mode === "installment" && method === "POST") {
          const data = new FormData(form); response = await send("/api/installments", "POST", { accountId: String(data.get("accountId")), destinationAccountId: String(data.get("destinationAccountId") || "") || null, categoryId: String(data.get("categoryId") || "") || null, kind: String(data.get("kind")), status: String(data.get("status")), description: String(data.get("description") || "").trim(), note: String(data.get("note") || "").trim() || null, plannedOn: String(data.get("plannedOn")), effectiveOn: String(data.get("effectiveOn") || "") || null, amountMinor: moneyToMinor(data.get("amountMinor")), amountMode: String(data.get("installmentValueMode") || "per_installment"), totalInstallments: Math.max(2, Number(data.get("installments") || 2)), initialSequenceNumber: Math.max(1, Number(data.get("installmentStart") || 1)), idempotencyKey: newIdempotencyKey() });
        } else response = await send(form.dataset.path || "/api/transactions", method, payload());
        statusNode.className = response.ok ? "form-status success full" : "form-status error full"; statusNode.textContent = await message(response); if (response.ok) setTimeout(() => location.reload(), 350);
      } catch { statusNode.className = "form-status error full"; statusNode.textContent = "Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente."; }
      finally { delete form.dataset.submitting; form.removeAttribute("aria-busy"); if (submit) submit.disabled = false; }
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
  accountCurrency: string | undefined,
): string | undefined {
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
function formatPercentage(value: number, maximumFractionDigits: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value)}%`;
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
    main { display:grid; gap:14px; margin:0 auto; min-width:0; padding:18px 20px; width:100%; }
    [hidden]{display:none!important}.warning{color:var(--warning);font-weight:600}
    .filter-form{align-items:end;display:grid;gap:10px;grid-template-columns:minmax(12rem,1.1fr) minmax(12rem,.75fr) minmax(12rem,1fr) minmax(11rem,.75fr) auto}
    .month-field,.account-field{display:grid;gap:6px}.account-select{position:relative}.account-select-trigger{align-items:center;background:var(--surface);border:1px solid var(--line);color:var(--text);display:flex;gap:8px;justify-content:flex-start;min-height:44px;padding:0 10px;text-align:left;width:100%}.account-select-text{flex:1;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-select-icon{align-items:center;display:inline-flex;flex-shrink:0;height:20px;width:20px}.account-select-chevron{color:var(--muted);flex-shrink:0}.account-select-menu{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 12px 32px rgba(15,23,42,.14);left:0;list-style:none;margin:4px 0 0;max-height:260px;overflow-y:auto;padding:4px;position:absolute;right:0;top:100%;z-index:20}.account-select-menu li{align-items:center;border-radius:var(--radius);cursor:pointer;display:flex;font-size:.875rem;font-weight:600;gap:8px;padding:7px 8px}.account-select-menu li:hover,.account-select-menu li[aria-selected=true]{background:var(--primary-soft)}
    .month-nav{align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:4px;grid-template-columns:auto minmax(0,1fr) auto;padding:3px}.month-nav input{background:transparent;border:0;font-size:.875rem;min-height:34px;text-align:center}.icon-btn{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);color:var(--primary);min-height:34px;min-width:34px;padding:0}.ghost-btn{background:var(--surface);border:1px solid var(--line);color:var(--primary)}
    .statement-layout{align-items:start;display:grid;gap:12px;grid-template-columns:minmax(260px,320px) minmax(0,1fr)}.account-summary{display:grid;gap:12px;position:sticky;top:68px}.account-summary h2{font-size:.9375rem}.summary-balance{background:var(--primary-soft);border:1px solid #d4e6ec;border-radius:var(--radius);display:grid;gap:4px;padding:12px}.summary-balance span,.summary-total span{color:var(--muted);font-size:.6875rem;font-weight:700;text-transform:uppercase}.summary-balance strong,.summary-total strong,.status-line strong,.col-amount,.col-balance{font-variant-numeric:tabular-nums;overflow-wrap:normal;white-space:nowrap;word-break:normal}.summary-balance strong{font-size:1.125rem}.summary-balance p{color:var(--muted);font-size:.8125rem}.summary-totals{display:grid;gap:8px;grid-template-columns:1fr 1fr}.summary-total{border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:3px;min-width:0;padding:10px}.status-overview{border-top:1px solid var(--line);display:grid;gap:8px;padding-top:12px}.status-overview h3{font-size:.8125rem}.status-line{align-items:center;display:grid;gap:6px;grid-template-columns:auto minmax(0,1fr) auto}.status-line p{color:var(--muted);font-size:.8125rem;font-weight:600}.status-line strong{font-size:.8125rem}
    .statement-panel{overflow:hidden;padding:0}.statement-toolbar{align-items:center;border-bottom:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;padding:12px 14px}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{align-items:center;background:var(--primary-soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);display:inline-flex;gap:5px;font-size:.75rem;font-weight:700;padding:3px 9px;white-space:nowrap}.chip-pending{background:var(--warning-bg);border-color:#fde68a;color:var(--warning)}.chip-ok{background:var(--success-bg);border-color:#bbf7d0;color:var(--success)}.chip-posted{background:#e0f2fe;border-color:#bae6fd;color:#0369a1}
    .statement-table{display:grid;max-width:100%;overflow-x:auto}.statement-row{align-items:center;border-bottom:1px solid var(--line);display:grid;gap:8px;grid-template-columns:6rem minmax(8rem,1.3fr) minmax(7rem,.9fr) 7rem 4.5rem 8rem 8rem 3rem;min-width:70rem;padding:8px 12px;position:relative}.col-select{display:grid;left:3px;place-items:center;position:absolute}.statement-body .col-date{padding-left:14px}.col-select input{height:1.1rem;width:1.1rem}.grouped-row{background:color-mix(in srgb,var(--primary) 5%,transparent)}.group-indicator{color:var(--primary)}.statement-head{background:#f1f7fa;color:var(--muted);font-size:.6875rem;font-weight:700;text-transform:uppercase}.statement-head .col-amount,.statement-head .col-balance,.col-amount,.col-balance{text-align:right}.description{display:grid;gap:2px;min-width:0}.description>strong{overflow-wrap:anywhere}.description span{color:var(--muted);font-size:.8125rem}.credit{color:var(--success)!important}.debit{color:var(--danger)!important}
    .selection-bar{align-items:center;background:var(--surface);border:1px solid var(--primary);border-radius:var(--radius);bottom:16px;box-shadow:var(--shadow);display:flex;gap:12px;justify-content:flex-end;padding:10px 14px;position:sticky;z-index:8}.selection-bar[hidden]{display:none}.group-modal-panel{max-width:760px}.group-modal-panel form{display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}.group-readonly,.group-members,.group-modal-panel .save-row,.group-modal-panel .form-error{grid-column:1/-1}.group-members{border:1px solid var(--line);border-radius:var(--radius);max-height:280px;overflow:auto}.group-members>div{align-items:center;border-bottom:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;padding:9px}
    .statement-status{align-items:center;border:1px solid currentColor;border-radius:999px;cursor:default;display:inline-flex;height:26px;justify-content:center;justify-self:start;padding:0;position:relative;width:26px}.statement-status-ok{background:var(--success-bg);color:var(--success)}.statement-status-posted{background:#e0f2fe;color:#0369a1}.statement-status-pending{background:var(--warning-bg);color:var(--warning)}.statement-status-planned{background:var(--primary-soft);color:var(--primary)}
    .actions{position:relative}.actions summary{align-items:center;background:var(--primary-soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);cursor:pointer;display:inline-flex;height:28px;justify-content:center;list-style:none;width:28px}.actions summary::-webkit-details-marker{display:none}.actions-menu{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 12px 32px rgba(15,23,42,.14);display:grid;gap:2px;max-width:220px;padding:4px;position:absolute;right:0;top:34px;width:max-content;z-index:50}.actions-item{align-items:center;background:transparent;border:0;border-radius:var(--radius);color:var(--text);display:flex;font-size:.8125rem;font-weight:600;gap:8px;justify-content:flex-start;min-height:32px;padding:0 8px;text-align:left;white-space:nowrap}.actions-item.danger{color:var(--danger)}.actions-divider{border:0;border-top:1px solid var(--line);margin:3px 2px}
    .account-remuneration-audit{margin-top:4px;max-width:100%;min-width:0}.account-remuneration-audit summary{color:var(--primary);cursor:pointer;font-size:.75rem;font-weight:700}.account-remuneration-audit dl{display:grid;gap:4px 10px;grid-template-columns:repeat(2,minmax(0,1fr));margin:7px 0 0}.account-remuneration-audit dl div{min-width:0}.account-remuneration-audit dt{color:var(--muted);font-size:.68rem}.account-remuneration-audit dd{font-size:.75rem;font-weight:700;margin:0;overflow-wrap:anywhere}.account-remuneration-audit-heading{align-items:center;display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between}.account-remuneration-adjustment{font-size:.68rem}
    .empty{background:var(--bg);border:1px dashed var(--line);border-radius:var(--radius-lg);display:grid;gap:4px;margin:14px;padding:14px}dialog{border:0;border-radius:var(--radius-lg);box-shadow:0 24px 80px rgba(15,23,42,.24);max-width:min(860px,calc(100vw - 32px));padding:0;width:100%}dialog::backdrop{background:rgba(6,25,35,.48)}.modal-panel{display:grid;gap:14px;padding:18px}.close-form{display:flex;justify-content:flex-end}.modal-panel form[data-form]{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}.full,.modal-panel button[type=submit],.modal-panel form[data-form] p{grid-column:1/-1}.save-row{align-items:center;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between}.status-icons{align-items:center;display:flex;gap:6px}.status-icon-btn{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:999px;color:var(--muted);display:inline-flex;height:32px;justify-content:center;min-height:0;padding:0;width:32px}.status-icon-btn[data-status-option=posted].active{background:#e0f2fe;color:#0369a1}.status-icon-btn[data-status-option=reconciled].active{background:var(--success-bg);color:var(--success)}.status-icon-btn[data-status-option=planned].active{background:var(--warning-bg);color:var(--warning)}.status-label{color:var(--muted);font-size:.75rem;font-weight:600}
    @media(max-width:1279px){.statement-layout{grid-template-columns:1fr}.account-summary{position:static}.summary-totals{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:1100px){.filter-form{grid-template-columns:repeat(2,minmax(0,1fr))}.statement-filter-actions{grid-column:1/-1}.modal-panel form[data-form]{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:760px){main{padding:14px 14px 24px}.filter-form,.modal-panel form[data-form],.group-modal-panel form,.summary-totals{grid-template-columns:1fr}.statement-filter-actions{align-items:stretch;display:grid}.statement-toolbar{align-items:stretch;display:grid}.save-row{align-items:stretch;flex-direction:column}.statement-table{overflow-x:visible}.statement-head{display:none}.statement-row.statement-body{align-items:center;display:flex;flex-wrap:wrap;gap:5px 8px;min-width:0;padding:10px}.statement-row.statement-body .col-select{left:auto;order:1;position:static}.statement-row.statement-body .col-date{color:var(--muted);flex:0 0 auto;font-size:.75rem;order:1;padding-left:0}.statement-row.statement-body .col-actions{margin-left:auto;order:2}.statement-row.statement-body .col-description{flex:1 1 100%;order:3}.statement-row.statement-body .col-category,.statement-row.statement-body .col-kind{color:var(--muted);font-size:.75rem;order:4}.statement-row.statement-body .col-status{order:5}.statement-row.statement-body .col-amount{font-size:.9375rem;margin-left:auto;order:6}.statement-row.statement-body .col-balance{color:var(--muted);font-size:.75rem;order:7}.statement-date-group{position:sticky;top:0;z-index:2}}
    ${recurrencesSectionStyles()}`;
}
