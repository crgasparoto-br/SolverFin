import type { AccountRecord } from "./transactions-statement.js";
import { monthToPeriod } from "./transactions-statement.js";
import type { CategoryRecord, StatementPresentation } from "./transactions-page-v2.js";
import { escapeHtml, formatDate } from "./transactions-render-helpers.js";

interface FilterDependencies {
  renderAccountPicker: (
    accounts: readonly AccountRecord[],
    selectedAccount: AccountRecord | undefined,
    selectedId: string | undefined,
    consolidatedCurrency: string | undefined,
    availableCurrencies: readonly string[],
  ) => string;
  renderCategoryOptions: (categories: readonly CategoryRecord[], selected?: string) => string;
  renderSortOptions: (selected: StatementPresentation["sort"]) => string;
  filterIcon: (name: string) => string;
  statementTodayInSaoPaulo: (now?: Date) => string;
}

/** Renders only the canonical statement filter controls. */
export function createStatementFilters({
  renderAccountPicker,
  renderCategoryOptions,
  renderSortOptions,
  filterIcon,
  statementTodayInSaoPaulo,
}: FilterDependencies) {
  return function renderFilters(
    accounts: readonly AccountRecord[],
    selectedAccount: AccountRecord | undefined,
    selectedId: string | undefined,
    month: string,
    presentation: StatementPresentation,
    url: URL | undefined,
    categories: readonly CategoryRecord[],
    consolidatedCurrency: string | undefined,
    availableCurrencies: readonly string[],
    resolvedPeriod: { startsOn: string; endsOn: string; day?: string },
  ): string {
    const preserved = [
      "profileId",
      ...(consolidatedCurrency ? [] : ["currency"]),
      "evidence",
      "from",
      "to",
      "merchantKey",
    ]
      .map((name) => {
        const value = url?.searchParams.get(name);
        return value ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : "";
      })
      .join("");

    const day = resolvedPeriod.day;
    const dayBounds = monthToPeriod(month);
    const activePeriod = resolvedPeriod;
    const rangeSelected = Boolean(
      !day && url?.searchParams.get("from") && url?.searchParams.get("to"),
    );
    // Keep user/profile/currency and search filters; replace only the period.
    const shortcutBase = new URLSearchParams(url?.searchParams);
    for (const param of ["day", "from", "to", "startsOn", "endsOn"]) {
      shortcutBase.delete(param);
    }
    if (selectedId) shortcutBase.set("accountId", selectedId);
    if (consolidatedCurrency) shortcutBase.set("currency", consolidatedCurrency);
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
    const todayIso = statementTodayInSaoPaulo();
    const dayOffset = (count: number): string => {
      const date = new Date(todayIso + "T12:00:00.000Z");
      date.setUTCDate(date.getUTCDate() - count);
      return date.toISOString().slice(0, 10);
    };
    const previousMonth = (() => {
      const date = new Date(todayIso + "T12:00:00.000Z");
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - 1);
      return date.toISOString().slice(0, 7);
    })();
    const currentMonth = todayIso.slice(0, 7);
    const periodShortcuts = [
      shortcut(
        "today",
        "Hoje",
        { month: currentMonth, day: todayIso },
        day === todayIso && !rangeSelected,
      ),
      shortcut(
        "last7",
        "7 dias",
        { month: currentMonth, from: dayOffset(6), to: todayIso },
        rangeSelected && activePeriod.startsOn === dayOffset(6) && activePeriod.endsOn === todayIso,
      ),
      shortcut(
        "last30",
        "30 dias",
        { month: currentMonth, from: dayOffset(29), to: todayIso },
        rangeSelected &&
          activePeriod.startsOn === dayOffset(29) &&
          activePeriod.endsOn === todayIso,
      ),
      shortcut(
        "thisMonth",
        "Este mês",
        { month: currentMonth },
        month === currentMonth && !day && !rangeSelected,
      ),
      shortcut(
        "previousMonth",
        "Mês anterior",
        { month: previousMonth },
        month === previousMonth && !day && !rangeSelected,
      ),
    ].join("");
    const activeFilterCount = [
      presentation.search,
      presentation.filterKind,
      presentation.filterStatus,
      presentation.filterReconciliation,
      presentation.insightCategoryId,
      day,
      rangeSelected ? "range" : undefined,
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
    <div class="statement-day-field" data-statement-day-field>
      <label for="filter-day">Dia do mês</label>
      <div class="statement-day-controls">
        <input id="filter-day" name="day" type="date" lang="pt-BR" aria-label="Filtrar lançamentos por dia do mês" min="${escapeHtml(dayBounds.startsOn)}" max="${escapeHtml(dayBounds.endsOn)}" value="${escapeHtml(day ?? "")}" />
        <button type="button" class="ghost-btn statement-day-clear" data-clear-statement-day aria-label="Exibir o mês completo"${day ? "" : " hidden"}>Mês completo</button>
      </div>
    </div>
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
  };
}
