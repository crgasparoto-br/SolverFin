import { formatDateOnly } from "@solverfin/shared";

import { renderMoney } from "../design-system/money.js";
import {
  renderBadge,
  renderDetailLayout,
  renderEmptyState,
  renderFilterBar,
  renderPageContainer,
  renderPageHeader,
  renderSummaryGrid,
  renderTabs,
} from "../design-system/primitives.js";
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

type CardSort =
  | "date_asc"
  | "date_desc"
  | "amount_desc"
  | "amount_asc"
  | "description_asc"
  | "description_desc";
type ReconciliationFilter = "all" | "reconciled" | "unreconciled";

interface CardRecord {
  id: string;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  creditLimitMinor?: number;
  maskedIdentifier?: string;
  institutionKey?: string;
}
interface InvoiceRecord {
  id: string;
  cardId: string;
  status: string;
  periodStartOn: string;
  periodEndOn: string;
  dueOn: string;
  totalAmountMinor: number;
  currency?: string;
}
interface AccountRecord {
  id: string;
  name: string;
  status?: string;
  currency?: string;
}
interface CategoryRecord {
  id: string;
  name: string;
  status?: string;
}
interface CardInstrumentRecord {
  id: string;
  type: string;
  holder: string;
  status: string;
  isDefault: boolean;
  name?: string;
  maskedIdentifier?: string;
  effectiveCreditLimitMinor?: number;
}
interface CardPurchaseRecord {
  id: string;
  financialProfileId: string;
  cardId: string;
  cardInstrumentId?: string;
  invoiceId?: string;
  categoryId?: string;
  recurrenceId?: string;
  installmentId?: string;
  occurredOn: string;
  plannedOn?: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
}
interface InvoiceSummaryRecord {
  invoiceId: string;
  financialProfileId: string;
  cardId: string;
  cardName: string;
  cardMaskedIdentifier?: string;
  status: string;
  periodStartOn: string;
  closingOn: string;
  dueOn: string;
  previousBalanceMinor: number;
  totalExpensesMinor: number;
  totalPaidMinor: number;
  amountDueMinor: number;
  reconciledExpensesMinor: number;
  unreconciledExpensesMinor: number;
  purchasesCount: number;
  cardTotals: InvoiceCardTotalRecord[];
}
interface InvoiceCardTotalRecord {
  cardId: string;
  cardName: string;
  maskedIdentifier?: string;
  limitTotalMinor: number;
  limitUsedMinor: number;
  limitAvailableMinor: number;
  invoiceTotalMinor: number;
  invoiceAmountDueMinor: number;
}
interface CardPresentation {
  search: string;
  sort: CardSort;
  reconciliation: ReconciliationFilter;
  day?: string;
}
interface InstrumentPurchaseGroup {
  id: string;
  label: string;
  purchases: CardPurchaseRecord[];
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const SORTS = new Set<CardSort>([
  "date_asc",
  "date_desc",
  "amount_desc",
  "amount_asc",
  "description_asc",
  "description_desc",
]);

export async function renderCardsPageV2(
  token: string,
  url = new URL("http://solverfin.local/cartoes"),
): Promise<string> {
  const [cardsResult, invoicesResult, accountsResult, categoriesResult] = await Promise.all([
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
    apiGet<{ invoices: InvoiceRecord[] }>(token, "/api/invoices?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);

  if (!cardsResult.ok) return renderErrorPage(cardsResult.error);
  if (!invoicesResult.ok) return renderErrorPage(invoicesResult.error);

  const cards = cardsResult.data.cards.filter((card) => card.status !== "archived");
  const invoices = invoicesResult.data.invoices;
  const selectedCard = resolveSelectedCard(cards, url.searchParams.get("cardId"));
  const cardInvoices = selectedCard ? invoicesForCard(invoices, selectedCard.id) : [];
  const selectedInvoice = resolveSelectedInvoice(cardInvoices, url);
  const presentation = resolvePresentation(url, selectedInvoice);

  const instrumentsResult = selectedCard
    ? await apiGet<{ instruments: CardInstrumentRecord[] }>(
        token,
        `/api/credit-card-accounts/${encodeURIComponent(selectedCard.id)}/instruments`,
      )
    : { ok: true as const, data: { instruments: [] as CardInstrumentRecord[] } };
  if (selectedCard && !instrumentsResult.ok) return renderErrorPage(instrumentsResult.error);
  const instruments = instrumentsResult.ok ? instrumentsResult.data.instruments : [];
  const activeInstruments = instruments.filter((instrument) => instrument.status === "active");

  // Recurrences are fetched first because the API may materialize a due purchase.
  const recurrencesResult = selectedCard
    ? await apiGet<{ recurrences: RecurrenceRecord[] }>(
        token,
        `/api/recurrences?cardId=${encodeURIComponent(selectedCard.id)}&status=all`,
      )
    : { ok: true as const, data: { recurrences: [] as RecurrenceRecord[] } };
  if (selectedCard && !recurrencesResult.ok) return renderErrorPage(recurrencesResult.error);
  const recurrences = recurrencesResult.ok ? recurrencesResult.data.recurrences : [];

  const [summaryResult, purchasesResult] = selectedInvoice
    ? await Promise.all([
        apiGet<{ summary: InvoiceSummaryRecord }>(
          token,
          `/api/invoices/${encodeURIComponent(selectedInvoice.id)}/summary`,
        ),
        apiGet<{ purchases: CardPurchaseRecord[] }>(
          token,
          `/api/invoices/${encodeURIComponent(selectedInvoice.id)}/purchases`,
        ),
      ])
    : ([
        { ok: true, data: { summary: undefined as InvoiceSummaryRecord | undefined } },
        { ok: true, data: { purchases: [] as CardPurchaseRecord[] } },
      ] as const);

  if (selectedInvoice && !accountsResult.ok) return renderErrorPage(accountsResult.error);
  if (selectedInvoice && !categoriesResult.ok) return renderErrorPage(categoriesResult.error);
  if (!summaryResult.ok) return renderErrorPage(summaryResult.error);
  if (!purchasesResult.ok) return renderErrorPage(purchasesResult.error);

  const accounts = accountsResult.ok ? accountsResult.data.accounts : [];
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];
  const summary = summaryResult.data.summary;
  const canonicalPurchases = purchasesResult.data.purchases;
  const invoiceCurrency = resolveInvoiceCurrency(selectedInvoice, canonicalPurchases);
  const visiblePurchases = sortPurchases(
    filterPurchases(canonicalPurchases, categories, presentation),
    presentation.sort,
  );
  const groups = groupPurchasesByInstrument(visiblePurchases, instruments, invoiceCurrency);
  const matchingPaymentAccounts = invoiceCurrency
    ? accounts.filter(
        (account) =>
          account.status !== "archived" && normalizeCurrency(account.currency) === invoiceCurrency,
      )
    : [];

  const content = renderPageContainer({
    className: "cards-a3-page",
    childrenHtml: `${renderPageHeader({
      eyebrow: "Cartões e faturas",
      title: "Cartões de Crédito",
      description:
        "Acompanhe cada cartão pela fatura selecionada e revise as compras que a compõem.",
      actionsHtml: renderPageActions(selectedCard, activeInstruments),
    })}${renderDetailLayout({
      masterHtml: renderCardMaster(cards, selectedCard, instruments, invoiceCurrency, url),
      detailHtml: renderInvoiceDetail({
        card: selectedCard,
        invoices: cardInvoices,
        invoice: selectedInvoice,
        summary,
        purchases: canonicalPurchases,
        visiblePurchases,
        groups,
        categories,
        recurrences,
        presentation,
        currency: invoiceCurrency,
        paymentAccounts: matchingPaymentAccounts,
        url,
      }),
    })}`,
  });

  return renderShell(`
    <div class="cards-layout" data-cards-archetype="A3">
      ${content}
      ${renderPurchaseModal(selectedCard, categories, activeInstruments, invoiceCurrency)}
      ${renderPaymentModal(
        selectedInvoice,
        matchingPaymentAccounts,
        summary?.amountDueMinor ?? selectedInvoice?.totalAmountMinor ?? 0,
        invoiceCurrency,
      )}
      ${renderRecurrenceEditModal(
        categories,
        "card",
        renderInstrumentOptions(activeInstruments, invoiceCurrency),
        invoiceCurrency ?? "moeda indisponível",
      )}
      ${clientScript()}
      ${recurrencesSectionScript()}
    </div>
  `);
}

function resolveSelectedCard(
  cards: readonly CardRecord[],
  requestedId: string | null,
): CardRecord | undefined {
  if (requestedId) {
    const requested = cards.find((card) => card.id === requestedId);
    if (requested) return requested;
  }
  return cards.find((card) => card.status === "active") ?? cards[0];
}

function invoicesForCard(invoices: readonly InvoiceRecord[], cardId: string): InvoiceRecord[] {
  return invoices
    .filter((invoice) => invoice.cardId === cardId)
    .sort((left, right) => right.periodEndOn.localeCompare(left.periodEndOn));
}

function resolveSelectedInvoice(
  invoices: readonly InvoiceRecord[],
  url: URL,
): InvoiceRecord | undefined {
  const invoiceId = url.searchParams.get("invoiceId");
  if (invoiceId) {
    const requested = invoices.find((invoice) => invoice.id === invoiceId);
    if (requested) return requested;
  }
  const month = normalizeMonth(url.searchParams.get("month"));
  if (month) return invoices.find((invoice) => invoice.periodEndOn.slice(0, 7) === month);
  return invoices.find((invoice) => invoice.status === "open") ?? invoices[0];
}

function resolvePresentation(url: URL, invoice: InvoiceRecord | undefined): CardPresentation {
  const rawSort = url.searchParams.get("sort");
  const rawReconciliation = url.searchParams.get("reconciliation");
  const day = normalizeDay(url.searchParams.get("day"));
  return {
    search: (url.searchParams.get("q") ?? url.searchParams.get("search") ?? "")
      .trim()
      .slice(0, 160),
    sort: SORTS.has(rawSort as CardSort) ? (rawSort as CardSort) : "date_desc",
    reconciliation:
      rawReconciliation === "reconciled" || rawReconciliation === "unreconciled"
        ? rawReconciliation
        : "all",
    ...(day && invoice && day >= invoice.periodStartOn && day <= invoice.periodEndOn
      ? { day }
      : {}),
  };
}

function filterPurchases(
  purchases: readonly CardPurchaseRecord[],
  categories: readonly CategoryRecord[],
  presentation: CardPresentation,
): CardPurchaseRecord[] {
  const query = normalizeSearch(presentation.search);
  return purchases.filter((purchase) => {
    if (presentation.day && purchase.occurredOn !== presentation.day) return false;
    const reconciled = purchase.status === "reconciled";
    if (presentation.reconciliation === "reconciled" && !reconciled) return false;
    if (presentation.reconciliation === "unreconciled" && reconciled) return false;
    if (!query) return true;
    const category = purchase.categoryId
      ? (categories.find((candidate) => candidate.id === purchase.categoryId)?.name ?? "")
      : "";
    return normalizeSearch(`${purchase.description} ${category} ${purchase.status}`).includes(
      query,
    );
  });
}

function sortPurchases(
  purchases: readonly CardPurchaseRecord[],
  sort: CardSort,
): CardPurchaseRecord[] {
  return [...purchases].sort((left, right) => {
    if (sort === "date_asc") return left.occurredOn.localeCompare(right.occurredOn);
    if (sort === "amount_desc") return Math.abs(right.amountMinor) - Math.abs(left.amountMinor);
    if (sort === "amount_asc") return Math.abs(left.amountMinor) - Math.abs(right.amountMinor);
    if (sort === "description_asc")
      return left.description.localeCompare(right.description, "pt-BR", { sensitivity: "base" });
    if (sort === "description_desc")
      return right.description.localeCompare(left.description, "pt-BR", { sensitivity: "base" });
    return right.occurredOn.localeCompare(left.occurredOn);
  });
}

function groupPurchasesByInstrument(
  purchases: readonly CardPurchaseRecord[],
  instruments: readonly CardInstrumentRecord[],
  currency: string | undefined,
): InstrumentPurchaseGroup[] {
  const groups = new Map<string, InstrumentPurchaseGroup>();
  const order: string[] = [];
  for (const purchase of purchases) {
    const id = purchase.cardInstrumentId ?? "__unassigned__";
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        label:
          id === "__unassigned__"
            ? "Sem instrumento identificado"
            : formatInstrumentLabel(
                instruments.find((instrument) => instrument.id === id),
                currency,
              ),
        purchases: [],
      };
      groups.set(id, group);
      order.push(id);
    }
    group.purchases.push(purchase);
  }
  return order.map((id) => groups.get(id)).filter(isDefined);
}

function renderPageActions(
  card: CardRecord | undefined,
  instruments: readonly CardInstrumentRecord[],
): string {
  const disabled = !card || card.status !== "active" || instruments.length === 0;
  const reason = !card
    ? "Selecione um cartão"
    : instruments.length === 0
      ? "Cadastre um instrumento ativo em Contas e Cartões"
      : card.status !== "active"
        ? "O cartão selecionado não está ativo"
        : "Registrar compra neste cartão";
  return `<button type="button" class="sf-button sf-button-primary" data-open-modal="purchase"${disabled ? " disabled" : ""} title="${escapeHtml(reason)}">Registrar compra</button>`;
}

function renderCardMaster(
  cards: readonly CardRecord[],
  selectedCard: CardRecord | undefined,
  instruments: readonly CardInstrumentRecord[],
  invoiceCurrency: string | undefined,
  url: URL,
): string {
  if (cards.length === 0) {
    return renderEmptyState({
      title: "Nenhum cartão cadastrado",
      description: "Cadastre um cartão para acompanhar faturas, limites e compras.",
      actionHtml:
        '<a class="sf-button sf-button-primary" href="/contas-cartoes">Cadastrar cartão</a>',
    });
  }
  const options = cards
    .map(
      (card) =>
        `<option value="${escapeHtml(card.id)}"${card.id === selectedCard?.id ? " selected" : ""}>${escapeHtml(card.name)}${card.maskedIdentifier ? ` · ${escapeHtml(card.maskedIdentifier)}` : ""}</option>`,
    )
    .join("");
  const institution = selectedCard ? findInstitution(selectedCard.institutionKey) : undefined;
  const active = instruments.filter((instrument) => instrument.status === "active");
  const archived = instruments.filter((instrument) => instrument.status !== "active");
  const profileId = url.searchParams.get("profileId");
  return `<section class="cards-master-panel" aria-labelledby="cards-master-title">
    <div class="cards-master-heading">
      <div><span class="cards-kicker">Cartão</span><h2 id="cards-master-title">Selecionado</h2></div>
      <a class="cards-edit-link" href="/contas-cartoes">Gerenciar</a>
    </div>
    <form method="get" action="/cartoes" class="cards-card-picker" data-card-picker-form>
      ${profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(profileId)}">` : ""}
      <label for="cards-card-select">Cartão</label>
      <select id="cards-card-select" name="cardId" data-card-select>${options}</select>
    </form>
    ${
      selectedCard
        ? `<div class="cards-card-identity">
      <span class="cards-card-icon" aria-hidden="true">${institution ? renderInstitutionIcon(institution.key) : ""}</span>
      <div><strong>${escapeHtml(selectedCard.name)}</strong><span>${escapeHtml(selectedCard.maskedIdentifier ?? "Identificador não informado")}</span></div>
      ${renderBadge({
        label: formatCardStatus(selectedCard.status),
        tone: selectedCard.status === "active" ? "positive" : "attention",
      })}
    </div>`
        : ""
    }
    <dl class="cards-master-meta">
      <div><dt>Moeda da fatura</dt><dd>${escapeHtml(invoiceCurrency ?? "Indisponível")}</dd></div>
      <div><dt>Fechamento contratual</dt><dd>Dia ${escapeHtml(String(selectedCard?.closingDay ?? "-"))}</dd></div>
      <div><dt>Vencimento contratual</dt><dd>Dia ${escapeHtml(String(selectedCard?.dueDay ?? "-"))}</dd></div>
    </dl>
    <details class="cards-instrument-nav" open>
      <summary>Instrumentos <span>${active.length} ativos</span></summary>
      <ul>
        ${
          active
            .map(
              (instrument) =>
                `<li><span>${escapeHtml(formatInstrumentLabel(instrument, invoiceCurrency))}</span>${instrument.isDefault ? "<strong>Padrão</strong>" : ""}</li>`,
            )
            .join("") || "<li><span>Nenhum instrumento ativo.</span></li>"
        }
        ${archived
          .map(
            (instrument) =>
              `<li class="muted"><span>${escapeHtml(formatInstrumentLabel(instrument, invoiceCurrency))}</span><small>Arquivado</small></li>`,
          )
          .join("")}
      </ul>
    </details>
  </section>`;
}

function renderInvoiceDetail(input: {
  card: CardRecord | undefined;
  invoices: readonly InvoiceRecord[];
  invoice: InvoiceRecord | undefined;
  summary: InvoiceSummaryRecord | undefined;
  purchases: readonly CardPurchaseRecord[];
  visiblePurchases: readonly CardPurchaseRecord[];
  groups: readonly InstrumentPurchaseGroup[];
  categories: readonly CategoryRecord[];
  recurrences: readonly RecurrenceRecord[];
  presentation: CardPresentation;
  currency: string | undefined;
  paymentAccounts: readonly AccountRecord[];
  url: URL;
}): string {
  if (!input.card) {
    return renderEmptyState({
      title: "Selecione um cartão",
      description: "A fatura e as compras sempre aparecem no contexto do cartão selecionado.",
    });
  }
  const invoiceNavigation = renderInvoiceNavigation(
    input.invoices,
    input.invoice,
    input.card.id,
    input.url,
  );
  if (!input.invoice) {
    const requestedMonth = normalizeMonth(input.url.searchParams.get("month"));
    return `<section class="cards-detail-panel" aria-label="Fatura do cartão">
      ${invoiceNavigation}
      ${renderEmptyState({
        title: requestedMonth
          ? `Nenhuma fatura em ${formatMonth(requestedMonth)}`
          : "Nenhuma fatura disponível",
        description: "Registre uma compra para criar e acompanhar a primeira fatura deste cartão.",
      })}
    </section>`;
  }
  return `<section class="cards-detail-panel" aria-labelledby="cards-invoice-title">
    ${invoiceNavigation}
    ${renderInvoiceHeader(input.invoice, input.summary, input.currency, input.paymentAccounts)}
    ${renderInvoiceSummary(input.invoice, input.summary, input.currency)}
    ${renderPurchaseFilters(
      input.card.id,
      input.invoice,
      input.presentation,
      input.purchases,
      input.visiblePurchases,
      input.url,
    )}
    ${renderPurchaseGroups(
      input.groups,
      input.categories,
      input.recurrences,
      input.invoices,
      input.invoice,
      input.currency,
    )}
  </section>`;
}

function renderInvoiceNavigation(
  invoices: readonly InvoiceRecord[],
  selectedInvoice: InvoiceRecord | undefined,
  cardId: string,
  url: URL,
): string {
  const tabs = invoices.map((invoice) => ({
    label: `${formatInvoicePeriod(invoice)} · ${formatInvoiceStatus(invoice.status)}`,
    href: buildInvoiceHref(url, cardId, invoice),
    active: invoice.id === selectedInvoice?.id,
  }));
  const month =
    selectedInvoice?.periodEndOn.slice(0, 7) ??
    normalizeMonth(url.searchParams.get("month")) ??
    currentMonth();
  const profileId = url.searchParams.get("profileId");
  return `<div class="cards-invoice-navigation" data-invoice-navigation>
    <div class="cards-invoice-navigation-head"><div><span class="cards-kicker">Faturas</span><strong>Navegar por período</strong></div>
      <form method="get" action="/cartoes" class="cards-month-jump">
        <input type="hidden" name="cardId" value="${escapeHtml(cardId)}">
        ${profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(profileId)}">` : ""}
        <label for="cards-invoice-month">Ir para mês</label>
        <input id="cards-invoice-month" type="month" name="month" value="${escapeHtml(month)}" data-invoice-month-input>
        <button type="submit" class="sf-button sf-button-secondary">Ir</button>
      </form>
    </div>
    ${tabs.length > 0 ? renderTabs({ label: "Faturas do cartão", items: tabs }) : ""}
  </div>`;
}

function renderInvoiceHeader(
  invoice: InvoiceRecord,
  summary: InvoiceSummaryRecord | undefined,
  currency: string | undefined,
  paymentAccounts: readonly AccountRecord[],
): string {
  const status = summary?.status ?? invoice.status;
  const canClose = status === "open";
  const canPay = !["paid", "cancelled"].includes(status);
  const amountDueMinor = summary?.amountDueMinor ?? invoice.totalAmountMinor;
  return `<header class="cards-invoice-header">
    <div class="cards-invoice-title-block">
      <div class="cards-invoice-title-row"><span class="cards-kicker">Fatura selecionada</span>${renderBadge({ label: formatInvoiceStatus(status), tone: invoiceTone(status) })}</div>
      <h2 id="cards-invoice-title">${escapeHtml(formatInvoicePeriod(invoice))}</h2>
      <p>${escapeHtml(currency ?? "Moeda indisponível")} · Fechamento ${formatDate(invoice.periodEndOn)} · Vencimento ${formatDate(invoice.dueOn)}</p>
    </div>
    <div class="cards-invoice-primary">
      <span>Valor a pagar</span><strong>${money(amountDueMinor, currency)}</strong>
      <div class="cards-invoice-actions">
        ${canClose ? `<button type="button" class="sf-button sf-button-primary" data-api-path="/api/invoices/${escapeHtml(invoice.id)}/close" data-confirm="Fechar esta fatura?">Fechar fatura</button>` : ""}
        ${
          canPay
            ? `<button type="button" class="sf-button ${canClose ? "sf-button-secondary" : "sf-button-primary"}" data-open-modal="payment"${paymentAccounts.length > 0 ? "" : " disabled"} title="${paymentAccounts.length > 0 ? "Liquidar esta fatura" : "Cadastre uma conta ativa na mesma moeda da fatura"}">Liquidar fatura</button>`
            : ""
        }
      </div>
    </div>
    <p class="cards-settlement-note"><strong>Liquidação não é uma nova compra.</strong> O pagamento movimenta a conta escolhida e quita a fatura sem registrar uma segunda despesa econômica.</p>
  </header>`;
}

function renderInvoiceSummary(
  invoice: InvoiceRecord,
  summary: InvoiceSummaryRecord | undefined,
  currency: string | undefined,
): string {
  const totals = summary?.cardTotals ?? [];
  const limitTotal = totals.reduce((sum, item) => sum + item.limitTotalMinor, 0);
  const limitUsed = totals.reduce((sum, item) => sum + item.limitUsedMinor, 0);
  const limitAvailable = totals.reduce((sum, item) => sum + item.limitAvailableMinor, 0);
  return `<section class="cards-invoice-summary" aria-label="Resumo da fatura">
    ${renderSummaryGrid({
      childrenHtml: [
        summaryMetric(
          "Total da fatura",
          money(summary?.totalExpensesMinor ?? invoice.totalAmountMinor, currency),
          currency,
        ),
        summaryMetric(
          "Conciliado",
          money(summary?.reconciledExpensesMinor ?? 0, currency),
          currency,
        ),
        summaryMetric(
          "Não conciliado",
          money(summary?.unreconciledExpensesMinor ?? 0, currency),
          currency,
        ),
        summaryMetric(
          "Limite disponível",
          totals.length > 0 ? money(limitAvailable, currency) : "Indisponível",
          currency,
        ),
      ].join(""),
    })}
    ${
      totals.length > 0
        ? `<dl class="cards-limit-detail"><div><dt>Limite total</dt><dd>${money(limitTotal, currency)}</dd></div><div><dt>Limite utilizado</dt><dd>${money(limitUsed, currency)}</dd></div></dl>`
        : ""
    }
  </section>`;
}

function summaryMetric(label: string, valueHtml: string, currency: string | undefined): string {
  return `<section class="cards-summary-metric"><span>${escapeHtml(label)}</span><strong>${valueHtml}</strong><small>${escapeHtml(currency ?? "Moeda indisponível")}</small></section>`;
}

function renderPurchaseFilters(
  cardId: string,
  invoice: InvoiceRecord,
  presentation: CardPresentation,
  allPurchases: readonly CardPurchaseRecord[],
  visiblePurchases: readonly CardPurchaseRecord[],
  url: URL,
): string {
  const reconciledCount = allPurchases.filter(
    (purchase) => purchase.status === "reconciled",
  ).length;
  const unreconciledCount = allPurchases.length - reconciledCount;
  const base = new URL(url);
  const profileId = url.searchParams.get("profileId");
  base.pathname = "/cartoes";
  base.search = "";
  base.searchParams.set("cardId", cardId);
  base.searchParams.set("invoiceId", invoice.id);
  if (profileId) base.searchParams.set("profileId", profileId);
  const controls = `<form method="get" action="/cartoes" class="cards-purchase-filter-form">
      <input type="hidden" name="cardId" value="${escapeHtml(cardId)}">
      <input type="hidden" name="invoiceId" value="${escapeHtml(invoice.id)}">
      <input type="hidden" name="reconciliation" value="${escapeHtml(presentation.reconciliation)}">
      ${profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(profileId)}">` : ""}
      <label class="cards-search-field" for="cards-purchase-search">Buscar compras
        <input id="cards-purchase-search" type="search" name="q" value="${escapeHtml(presentation.search)}" placeholder="Descrição ou categoria" data-purchase-search autocomplete="off">
      </label>
      <label for="cards-purchase-sort">Ordenar
        <select id="cards-purchase-sort" name="sort">${renderSortOptions(presentation.sort)}</select>
      </label>
      <label for="cards-purchase-day">Dia
        <input id="cards-purchase-day" type="date" name="day" min="${escapeHtml(invoice.periodStartOn)}" max="${escapeHtml(invoice.periodEndOn)}" value="${escapeHtml(presentation.day ?? "")}">
      </label>
      <button class="sf-button sf-button-secondary" type="submit">Aplicar</button>
    </form>
    <div class="cards-reconciliation-filters" aria-label="Filtrar conciliação">
      ${filterLink(withQuery(base, { reconciliation: "all" }), "Todas", allPurchases.length, presentation.reconciliation === "all", "all")}
      ${filterLink(withQuery(base, { reconciliation: "unreconciled" }), "Não conciliadas", unreconciledCount, presentation.reconciliation === "unreconciled", "unreconciled")}
      ${filterLink(withQuery(base, { reconciliation: "reconciled" }), "Conciliadas", reconciledCount, presentation.reconciliation === "reconciled", "reconciled")}
      <span class="cards-results-status" data-purchase-results-status role="status" aria-live="polite">${formatPurchaseCount(visiblePurchases.length)}</span>
    </div>`;
  return renderFilterBar({ label: "Filtros das compras da fatura", childrenHtml: controls });
}

function filterLink(
  href: string,
  label: string,
  count: number,
  active: boolean,
  value: string,
): string {
  return `<a class="cards-filter-chip${active ? " is-active" : ""}" href="${escapeHtml(href)}" data-reconciliation-toggle="${escapeHtml(value)}"${active ? ' aria-current="page"' : ""}><span>${escapeHtml(label)}</span><small>${count}</small></a>`;
}

function renderPurchaseGroups(
  groups: readonly InstrumentPurchaseGroup[],
  categories: readonly CategoryRecord[],
  recurrences: readonly RecurrenceRecord[],
  invoices: readonly InvoiceRecord[],
  selectedInvoice: InvoiceRecord,
  invoiceCurrency: string | undefined,
): string {
  if (groups.length === 0) {
    return `<div class="cards-purchase-empty" data-purchase-filter-empty>${renderEmptyState({
      title: "Nenhuma compra encontrada",
      description: "Ajuste os filtros ou registre uma compra para esta fatura.",
    })}</div>`;
  }
  return `<section class="cards-purchase-groups" aria-labelledby="cards-purchases-title">
    <div class="cards-section-heading"><div><span class="cards-kicker">Compras</span><h3 id="cards-purchases-title">Itens da fatura</h3></div><span>${escapeHtml(invoiceCurrency ?? "Moeda indisponível")}</span></div>
    ${groups
      .map((group) =>
        renderInstrumentGroup(group, categories, recurrences, invoices, selectedInvoice),
      )
      .join("")}
  </section>`;
}

function renderInstrumentGroup(
  group: InstrumentPurchaseGroup,
  categories: readonly CategoryRecord[],
  recurrences: readonly RecurrenceRecord[],
  invoices: readonly InvoiceRecord[],
  selectedInvoice: InvoiceRecord,
): string {
  const totals = totalsByCurrency(group.purchases);
  return `<details class="cards-instrument-group" data-instrument-purchase-group${group.id === "__unassigned__" ? "" : ` data-instrument-id="${escapeHtml(group.id)}"`} open>
    <summary><div><strong data-instrument-label>${escapeHtml(group.label)}</strong><span>${formatPurchaseCount(group.purchases.length)}</span></div><div class="cards-instrument-totals">${totals.map(([currency, amount]) => money(amount, currency)).join(" · ")}</div></summary>
    <div class="cards-purchase-table" role="table" aria-label="Compras de ${escapeHtml(group.label)}">
      <div class="cards-purchase-table-head" role="row"><span role="columnheader">Data</span><span role="columnheader">Compra</span><span role="columnheader">Situação</span><span role="columnheader">Valor</span><span role="columnheader">Ações</span></div>
      ${group.purchases
        .map((purchase) =>
          renderPurchaseRow(purchase, categories, recurrences, invoices, selectedInvoice),
        )
        .join("")}
    </div>
  </details>`;
}

function renderPurchaseRow(
  purchase: CardPurchaseRecord,
  categories: readonly CategoryRecord[],
  recurrences: readonly RecurrenceRecord[],
  invoices: readonly InvoiceRecord[],
  selectedInvoice: InvoiceRecord,
): string {
  const category = purchase.categoryId
    ? (categories.find((candidate) => candidate.id === purchase.categoryId)?.name ??
      "Sem categoria")
    : "Sem categoria";
  const recurrence = purchase.recurrenceId
    ? recurrences.find((candidate) => candidate.id === purchase.recurrenceId)
    : undefined;
  const locked = ["closed", "paid", "cancelled"].includes(selectedInvoice.status);
  const otherPeriods = invoices.filter((invoice) => invoice.id !== selectedInvoice.id);
  return `<article class="cards-purchase-row" role="row" data-purchase-item data-reconciliation="${purchase.status === "reconciled" ? "reconciled" : "unreconciled"}">
    <time role="cell" data-label="Data" datetime="${escapeHtml(purchase.occurredOn)}">${formatDate(purchase.occurredOn)}</time>
    <div role="cell" data-label="Compra" class="cards-purchase-description description"><strong>${escapeHtml(purchase.description)}${recurrence ? renderRecurrenceIndicator() : ""}</strong><span>${escapeHtml(category)}</span></div>
    <span role="cell" data-label="Situação">${renderBadge({ label: formatPurchaseStatus(purchase.status), tone: purchase.status === "reconciled" ? "positive" : "information" })}</span>
    <strong role="cell" data-label="Valor" class="cards-purchase-amount">${money(purchase.amountMinor, normalizeCurrency(purchase.currency))}</strong>
    <details class="cards-purchase-actions" role="cell" data-label="Ações"><summary aria-label="Ações da compra ${escapeHtml(purchase.description)}">•••</summary><div class="cards-purchase-menu actions-menu" role="menu">
      <button type="button" class="actions-item" role="menuitem" data-edit-purchase="${escapeHtml(purchase.id)}"${recurrence ? ` data-recurrence-id="${escapeHtml(recurrence.id)}"` : ""}${locked ? " disabled" : ""}>Editar compra</button>
      ${recurrence ? renderRecurrenceActionMenuItems(recurrence) : ""}
      ${!locked && otherPeriods.length > 0 ? `<span class="cards-move-hint">Mover para outra fatura disponível no menu</span>` : ""}
    </div></details>
    <script type="application/json" data-purchase="${escapeHtml(purchase.id)}">${serializeScriptJson(purchase)}</script>
  </article>`;
}

function renderPurchaseModal(
  selectedCard: CardRecord | undefined,
  categories: readonly CategoryRecord[],
  instruments: readonly CardInstrumentRecord[],
  currency: string | undefined,
): string {
  return `<dialog class="cards-dialog" data-modal="purchase" aria-labelledby="cards-purchase-dialog-title">
    <section class="cards-dialog-panel">
      <header><div><span class="cards-kicker">Compra no cartão</span><h2 id="cards-purchase-dialog-title" data-purchase-modal-title>Registrar compra</h2></div><button type="button" class="cards-dialog-close" data-close-modal aria-label="Fechar">×</button></header>
      <form data-purchase-form data-path="/api/credit-card-accounts/${escapeHtml(selectedCard?.id ?? "")}/purchases">
        <input type="hidden" name="currentPurchaseId"><input type="hidden" name="recurrenceId">
        <label>Valor${currency ? ` (${escapeHtml(currency)})` : ""}<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00"></label>
        <label>Moeda<input name="currency" value="${escapeHtml(currency ?? "")}" minlength="3" maxlength="3" pattern="[A-Za-z]{3}" required autocomplete="off"></label>
        <label>Data<input name="occurredOn" type="date" required></label>
        <label class="full">Descrição<input name="description" required placeholder="Compra no cartão"></label>
        <label>Instrumento<select name="cardInstrumentId"${instruments.length === 0 ? " disabled" : " required"}>${renderInstrumentOptions(instruments, currency)}</select></label>
        <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
        <label>Repetição<select name="repeatMode"><option value="single">Único</option><option value="installment">Parcelado</option><option value="fixed">Fixo</option></select></label>
        <label data-purchase-field="totalInstallments" hidden>Parcelas<input name="totalInstallments" type="number" min="2" max="120" value="2"></label>
        <label data-purchase-field="installmentStart" hidden>Parcela inicial<input name="installmentStart" type="number" min="1" max="120" value="1"></label>
        <label data-purchase-field="installmentValueMode" hidden>Valor informado<select name="installmentValueMode"><option value="per_installment">Valor da parcela</option><option value="total">Valor total</option></select></label>
        <label data-purchase-field="interval" hidden>A cada<input name="interval" type="number" min="1" max="60" value="1"></label>
        <label data-purchase-field="frequency" hidden>Frequência<select name="frequency"><option value="daily">Dia(s)</option><option value="weekly">Semana(s)</option><option value="monthly" selected>Mês(es)</option><option value="yearly">Ano(s)</option></select></label>
        <label data-purchase-field="endOn" hidden>Fim opcional<input name="endOn" type="date"></label>
        <p class="form-status full" data-form-status aria-live="polite"></p>
        <button class="sf-button sf-button-primary full" type="submit"${selectedCard && instruments.length > 0 ? "" : " disabled"}>Salvar compra</button>
      </form>
    </section>
  </dialog>`;
}

function renderPaymentModal(
  invoice: InvoiceRecord | undefined,
  accounts: readonly AccountRecord[],
  amountDueMinor: number,
  currency: string | undefined,
): string {
  return `<dialog class="cards-dialog" data-modal="payment" aria-labelledby="cards-payment-dialog-title">
    <section class="cards-dialog-panel">
      <header><div><span class="cards-kicker">Liquidação da fatura</span><h2 id="cards-payment-dialog-title">Liquidar fatura</h2></div><button type="button" class="cards-dialog-close" data-close-modal aria-label="Fechar">×</button></header>
      <p class="cards-payment-explanation">O pagamento reduz o saldo da conta escolhida e liquida a fatura. Ele não cria outra compra nem duplica a despesa já reconhecida.</p>
      <form data-payment-form data-path="/api/invoices/${escapeHtml(invoice?.id ?? "")}/pay">
        <label>Conta (${escapeHtml(currency ?? "moeda indisponível")})<select name="paymentAccountId" required>${renderAccountOptions(accounts)}</select></label>
        <label>Pago em<input name="paidOn" type="date" required></label>
        <label>Valor pago${currency ? ` (${escapeHtml(currency)})` : ""}<input name="amountMinor" data-money inputmode="decimal" value="${formatMoneyInput(amountDueMinor)}" required></label>
        <label class="full">Descrição<input name="description" value="Pagamento da fatura" required></label>
        <p class="form-status full" data-form-status aria-live="polite"></p>
        <button class="sf-button sf-button-primary full" type="submit"${invoice && accounts.length > 0 ? "" : " disabled"}>Confirmar liquidação</button>
      </form>
    </section>
  </dialog>`;
}

function renderSortOptions(selected: CardSort): string {
  const options: Array<[CardSort, string]> = [
    ["date_desc", "Data: mais recente"],
    ["date_asc", "Data: mais antiga"],
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
function renderInstrumentOptions(
  instruments: readonly CardInstrumentRecord[],
  currency: string | undefined,
): string {
  if (instruments.length === 0) return '<option value="">Nenhum instrumento ativo</option>';
  return instruments
    .map(
      (instrument) =>
        `<option value="${escapeHtml(instrument.id)}"${instrument.isDefault ? " selected" : ""}>${escapeHtml(formatInstrumentLabel(instrument, currency))}</option>`,
    )
    .join("");
}
function renderCategoryOptions(categories: readonly CategoryRecord[]): string {
  return categories
    .filter((category) => category.status === undefined || category.status === "active")
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`,
    )
    .join("");
}
function renderAccountOptions(accounts: readonly AccountRecord[]): string {
  if (accounts.length === 0) return '<option value="">Nenhuma conta compatível</option>';
  return accounts
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(normalizeCurrency(account.currency) ?? "moeda indisponível")}</option>`,
    )
    .join("");
}

function formatInstrumentLabel(
  instrument: CardInstrumentRecord | undefined,
  currency: string | undefined,
): string {
  if (!instrument) return "Instrumento arquivado ou indisponível";
  const title =
    instrument.name?.trim() ||
    `${formatInstrumentType(instrument.type)} - ${formatInstrumentHolder(instrument.holder)}`;
  const identifier = instrument.maskedIdentifier ? ` · ${instrument.maskedIdentifier}` : "";
  const limit =
    instrument.effectiveCreditLimitMinor === undefined
      ? ""
      : currency
        ? ` · limite ${currency} ${formatMinorNumber(instrument.effectiveCreditLimitMinor)}`
        : " · limite com moeda indisponível";
  return `${title}${identifier}${limit}`;
}
function formatInstrumentType(type: string): string {
  if (type === "physical") return "Físico";
  if (type === "virtual") return "Virtual";
  return type;
}
function formatInstrumentHolder(holder: string): string {
  if (holder === "primary") return "Titular principal";
  if (holder === "additional") return "Adicional";
  return holder;
}
function formatMinorNumber(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function resolveInvoiceCurrency(
  invoice: InvoiceRecord | undefined,
  purchases: readonly CardPurchaseRecord[],
): string | undefined {
  const invoiceCurrency = normalizeCurrency(invoice?.currency);
  if (invoiceCurrency) return invoiceCurrency;
  const purchaseCurrencies = [
    ...new Set(purchases.map((purchase) => normalizeCurrency(purchase.currency)).filter(isDefined)),
  ];
  return purchaseCurrencies.length === 1 ? purchaseCurrencies[0] : undefined;
}
function totalsByCurrency(purchases: readonly CardPurchaseRecord[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const purchase of purchases) {
    const currency = normalizeCurrency(purchase.currency);
    if (!currency) continue;
    totals.set(currency, (totals.get(currency) ?? 0) + purchase.amountMinor);
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));
}
function money(amountMinor: number, currency: string | undefined): string {
  if (!currency) return '<span class="money-unavailable">Valor indisponível</span>';
  return renderMoney({ amountMinor, currency });
}

function buildInvoiceHref(url: URL, cardId: string, invoice: InvoiceRecord): string {
  const next = new URL(url);
  next.pathname = "/cartoes";
  next.search = "";
  next.searchParams.set("cardId", cardId);
  next.searchParams.set("invoiceId", invoice.id);
  next.searchParams.set("month", invoice.periodEndOn.slice(0, 7));
  const profileId = url.searchParams.get("profileId");
  if (profileId) next.searchParams.set("profileId", profileId);
  return `${next.pathname}${next.search}`;
}
function withQuery(base: URL, changes: Record<string, string>): string {
  const next = new URL(base);
  for (const [name, value] of Object.entries(changes)) next.searchParams.set(name, value);
  return `${next.pathname}${next.search}`;
}
function normalizeMonth(value: string | null | undefined): string | undefined {
  return MONTH_PATTERN.test(value ?? "") ? (value ?? undefined) : undefined;
}
function normalizeDay(value: string | null | undefined): string | undefined {
  if (!DATE_PATTERN.test(value ?? "")) return undefined;
  const candidate = value ?? "";
  const date = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate
    ? undefined
    : candidate;
}
function normalizeCurrency(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized ?? "") ? normalized : undefined;
}
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}
function formatInvoicePeriod(invoice: InvoiceRecord): string {
  return formatMonth(invoice.periodEndOn.slice(0, 7));
}
function formatMonth(month: string): string {
  const normalized = normalizeMonth(month) ?? currentMonth();
  const [year, monthNumber] = normalized.split("-").map(Number) as [number, number];
  const label = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function formatDate(value: string): string {
  return formatDateOnly(value);
}
function formatInvoiceStatus(status: string): string {
  if (status === "open") return "Aberta";
  if (status === "closed") return "Fechada";
  if (status === "paid") return "Paga";
  if (status === "overdue") return "Vencida";
  if (status === "cancelled") return "Cancelada";
  return status;
}
function formatPurchaseStatus(status: string): string {
  if (status === "reconciled") return "Conciliada";
  if (status === "posted") return "Não conciliada";
  if (status === "planned") return "Planejada";
  return status;
}
function formatCardStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "blocked") return "Bloqueado";
  return status;
}
function invoiceTone(
  status: string,
): "positive" | "negative" | "neutral" | "attention" | "information" {
  if (status === "paid") return "positive";
  if (status === "overdue" || status === "cancelled") return "negative";
  if (status === "closed") return "neutral";
  return "information";
}
function formatPurchaseCount(count: number): string {
  return count === 1 ? "1 compra" : `${count} compras`;
}
function formatMoneyInput(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderShell(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/cartoes",
    content,
    currentLabel: "Cartões de Crédito",
    styles: css(),
  });
}
function renderErrorPage(error: string): string {
  return renderShell(
    renderPageContainer({
      className: "cards-a3-page",
      childrenHtml: `${renderPageHeader({ eyebrow: "Cartões e faturas", title: "Cartões de Crédito" })}<section class="cards-load-error" role="alert" data-cards-load-error><strong>Não foi possível carregar os dados de cartões.</strong><p>${escapeHtml(error)}</p><a class="sf-button sf-button-primary" href="/cartoes">Tentar novamente</a></section>`,
    }),
  );
}

function clientScript(): string {
  return `<script data-cards-a3-runtime="true">
    (() => {
      const moneyToMinor = (value) => {
        const normalized = String(value || "").replace(/\\./g, "").replace(",", ".");
        return Math.round(Number.parseFloat(normalized || "0") * 100);
      };
      const minorToMoney = (value) => (Number(value || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.querySelectorAll("[data-money]").forEach((input) => input.addEventListener("input", () => {
        const digits = input.value.replace(/\\D/g, "");
        input.value = minorToMoney(digits ? Number.parseInt(digits, 10) : 0);
      }));
      document.querySelector("[data-card-select]")?.addEventListener("change", (event) => event.target.form?.requestSubmit());

      let lastDialogTrigger = null;
      const closeDialog = (dialog) => {
        if (!dialog?.open) return;
        dialog.close();
        if (lastDialogTrigger && typeof lastDialogTrigger.focus === "function") lastDialogTrigger.focus();
        lastDialogTrigger = null;
      };
      const purchaseForm = document.querySelector("[data-purchase-form]");
      const repeatMode = purchaseForm?.querySelector('[name="repeatMode"]');
      const setField = (name, visible) => {
        const field = purchaseForm?.querySelector('[data-purchase-field="' + name + '"]');
        if (field) field.hidden = !visible;
      };
      const syncRepeatFields = () => {
        const mode = repeatMode?.value || "single";
        setField("totalInstallments", mode === "installment");
        setField("installmentStart", mode === "installment");
        setField("installmentValueMode", mode === "installment");
        setField("interval", mode === "fixed");
        setField("frequency", mode === "fixed");
        setField("endOn", mode === "fixed");
      };
      repeatMode?.addEventListener("change", syncRepeatFields);
      const resetPurchaseForm = () => {
        if (!purchaseForm) return;
        purchaseForm.reset();
        purchaseForm.dataset.method = "POST";
        const defaultPath = purchaseForm.getAttribute("data-path") || "";
        purchaseForm.dataset.path = defaultPath;
        purchaseForm.dataset.currentPurchaseId = "";
        purchaseForm.dataset.recurrenceId = "";
        purchaseForm.querySelector('[name="currentPurchaseId"]').value = "";
        purchaseForm.querySelector('[name="recurrenceId"]').value = "";
        if (repeatMode?.closest("label")) repeatMode.closest("label").hidden = false;
        const currencyField = purchaseForm.querySelector('[name="currency"]');
        if (currencyField) currencyField.disabled = false;
        document.querySelector("[data-purchase-modal-title]").textContent = "Registrar compra";
        syncRepeatFields();
      };
      document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => {
        if (button.disabled) return;
        const dialog = document.querySelector('dialog[data-modal="' + button.dataset.openModal + '"]');
        if (!dialog) return;
        lastDialogTrigger = button;
        if (button.dataset.openModal === "purchase") resetPurchaseForm();
        dialog.showModal();
      }));
      document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
      document.querySelectorAll("dialog.cards-dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      }));

      document.querySelectorAll("[data-purchase]").forEach((node) => {
        const purchase = JSON.parse(node.textContent || "{}");
        const button = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
        if (!button || button.disabled || !purchaseForm) return;
        button.addEventListener("click", () => {
          purchaseForm.reset();
          purchaseForm.dataset.path = "/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id;
          purchaseForm.dataset.method = "PATCH";
          purchaseForm.dataset.currentPurchaseId = purchase.id;
          purchaseForm.dataset.recurrenceId = purchase.recurrenceId || "";
          purchaseForm.querySelector('[name="currentPurchaseId"]').value = purchase.id;
          purchaseForm.querySelector('[name="recurrenceId"]').value = purchase.recurrenceId || "";
          purchaseForm.querySelector('[name="amountMinor"]').value = minorToMoney(purchase.amountMinor);
          purchaseForm.querySelector('[name="occurredOn"]').value = purchase.occurredOn;
          purchaseForm.querySelector('[name="description"]').value = purchase.description || "";
          purchaseForm.querySelector('[name="categoryId"]').value = purchase.categoryId || "";
          if (purchase.cardInstrumentId) purchaseForm.querySelector('[name="cardInstrumentId"]').value = purchase.cardInstrumentId;
          const currencyField = purchaseForm.querySelector('[name="currency"]');
          if (currencyField) {
            currencyField.value = purchase.currency || currencyField.value;
            currencyField.disabled = true;
          }
          if (repeatMode?.closest("label")) repeatMode.closest("label").hidden = true;
          syncRepeatFields();
          document.querySelector("[data-purchase-modal-title]").textContent = "Editar compra";
          lastDialogTrigger = button;
          document.querySelector('dialog[data-modal="purchase"]')?.showModal();
        });
      });

      const request = (path, method, body) => fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseMessage = async (response) => {
        const body = await response.json().catch(() => ({}));
        return response.ok ? "Ação concluída. Atualizando..." : (body?.error?.message || "Não foi possível concluir a ação.");
      };

      purchaseForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!purchaseForm.checkValidity()) {
          purchaseForm.reportValidity();
          return;
        }
        const data = new FormData(purchaseForm);
        const method = purchaseForm.dataset.method || "POST";
        const mode = method === "POST" ? String(data.get("repeatMode") || "single") : "single";
        const path = purchaseForm.dataset.path || "";
        const status = purchaseForm.querySelector("[data-form-status]");
        const currency = String(data.get("currency") || purchaseForm.querySelector('[name="currency"]')?.value || "").trim().toUpperCase();
        const payload = {
          amountMinor: moneyToMinor(data.get("amountMinor")),
          occurredOn: String(data.get("occurredOn") || ""),
          description: String(data.get("description") || ""),
        };
        const categoryId = String(data.get("categoryId") || "");
        const cardInstrumentId = String(data.get("cardInstrumentId") || "");
        if (categoryId) payload.categoryId = categoryId;
        if (cardInstrumentId) payload.cardInstrumentId = cardInstrumentId;
        if (method === "POST") payload.currency = currency;
        status.textContent = "Salvando...";
        let response;
        if (mode === "fixed") {
          const cardId = /credit-card-accounts\\/([^/]+)/.exec(path)?.[1] || "";
          const endOn = String(data.get("endOn") || "");
          response = await request("/api/recurrences", "POST", {
            frequency: String(data.get("frequency") || "monthly"),
            interval: Math.max(1, Number(data.get("interval") || 1)),
            startOn: payload.occurredOn,
            ...(endOn ? { endOn } : {}),
            amountMinor: payload.amountMinor,
            currency,
            description: payload.description,
            cardId,
            ...(cardInstrumentId ? { cardInstrumentId } : {}),
            ...(categoryId ? { categoryId } : {}),
          });
        } else if (mode === "installment") {
          const totalInstallments = Math.max(2, Number(data.get("totalInstallments") || 2));
          const installmentStart = Math.min(
            Math.max(1, Number(data.get("installmentStart") || 1)),
            totalInstallments,
          );
          const amountMinor =
            String(data.get("installmentValueMode")) === "per_installment"
              ? payload.amountMinor * totalInstallments
              : payload.amountMinor;
          response = await request(path, "POST", {
            ...payload,
            amountMinor,
            currency,
            totalInstallments,
            installmentStart,
          });
        } else {
          response = await request(path, method, payload);
        }
        status.textContent = await responseMessage(response);
        status.className = response.ok ? "form-status success full" : "form-status error full";
        if (response.ok) window.setTimeout(() => window.location.reload(), 350);
      });

      document.querySelector("[data-payment-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        const data = new FormData(form);
        const status = form.querySelector("[data-form-status]");
        status.textContent = "Liquidando...";
        const response = await request(form.dataset.path, "POST", {
          paymentAccountId: String(data.get("paymentAccountId") || ""),
          paidOn: String(data.get("paidOn") || ""),
          amountMinor: moneyToMinor(data.get("amountMinor")),
          description: String(data.get("description") || ""),
        });
        status.textContent = await responseMessage(response);
        status.className = response.ok ? "form-status success full" : "form-status error full";
        if (response.ok) window.setTimeout(() => window.location.reload(), 350);
      });

      document.querySelectorAll("[data-api-path]").forEach((button) => button.addEventListener("click", async () => {
        if (button.dataset.confirm && !window.confirm(button.dataset.confirm)) return;
        button.disabled = true;
        const response = await request(button.dataset.apiPath, button.dataset.apiMethod || "POST", {});
        if (!response.ok) {
          window.alert(await responseMessage(response));
          button.disabled = false;
          return;
        }
        window.setTimeout(() => window.location.reload(), 350);
      }));
      document.addEventListener("click", (event) => {
        document.querySelectorAll(".cards-purchase-actions[open]").forEach((details) => {
          if (!details.contains(event.target)) details.removeAttribute("open");
        });
      });
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".cards-purchase-actions[open]").forEach((details) => {
          const summary = details.querySelector("summary");
          details.removeAttribute("open");
          summary?.focus();
        });
      });
      syncRepeatFields();
    })();
  </script>`;
}

function css(): string {
  return `
    ${sharedShellStyles()}
    ${recurrencesSectionStyles()}
    [hidden]{display:none!important}
    [data-cards-archetype="A3"]{min-width:0}
    .cards-a3-page{display:grid;gap:14px;margin:0 auto;max-width:1500px;padding:18px 20px;width:100%}
    .cards-a3-page .sf-page-header{align-items:center}
    .cards-a3-page .sf-detail-layout{align-items:start;display:grid;gap:14px;grid-template-columns:minmax(240px,300px) minmax(0,1fr)}
    .cards-a3-page .sf-detail-layout-master,.cards-a3-page .sf-detail-layout-detail{min-width:0}
    .cards-master-panel,.cards-detail-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);min-width:0}
    .cards-master-panel{display:grid;gap:14px;padding:14px;position:sticky;top:70px}
    .cards-master-heading,.cards-invoice-navigation-head,.cards-section-heading{align-items:center;display:flex;gap:10px;justify-content:space-between}
    .cards-master-heading h2,.cards-section-heading h3{font-size:1rem;margin:2px 0 0}
    .cards-invoice-navigation-head>div{display:grid;gap:2px}
    .cards-kicker{color:var(--muted);font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
    .cards-edit-link{font-size:.82rem;font-weight:700}
    .cards-card-picker{display:grid;gap:6px}.cards-card-picker select{width:100%}
    .cards-card-identity{align-items:center;background:var(--bg);border-radius:var(--radius);display:grid;gap:9px;grid-template-columns:auto minmax(0,1fr) auto;padding:10px}
    .cards-card-icon{align-items:center;display:inline-flex;height:26px;width:26px}.cards-card-icon .brand-icon,.cards-card-icon .brand-icon-wrap,.cards-card-icon img{height:26px;width:26px}
    .cards-card-identity>div{display:grid;gap:2px;min-width:0}.cards-card-identity>div span{color:var(--muted);font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cards-master-meta{display:grid;gap:7px}.cards-master-meta>div{align-items:center;display:flex;gap:8px;justify-content:space-between}.cards-master-meta dt{color:var(--muted);font-size:.78rem}.cards-master-meta dd{font-size:.8rem;font-weight:750;text-align:right}
    .cards-instrument-nav{border-top:1px solid var(--line);padding-top:10px}.cards-instrument-nav summary{align-items:center;cursor:pointer;display:flex;font-weight:750;justify-content:space-between}.cards-instrument-nav summary span{color:var(--muted);font-size:.75rem}.cards-instrument-nav ul{display:grid;gap:7px;list-style:none;margin:10px 0 0;padding:0}.cards-instrument-nav li{align-items:start;display:flex;font-size:.78rem;gap:6px;justify-content:space-between}.cards-instrument-nav li span{min-width:0}.cards-instrument-nav li strong,.cards-instrument-nav li small{white-space:nowrap}
    .cards-detail-panel{display:grid;gap:0;overflow:hidden}
    .cards-invoice-navigation{border-bottom:1px solid var(--line);display:grid;gap:10px;padding:12px 14px}.cards-month-jump{align-items:end;display:flex;gap:6px}.cards-month-jump label{display:grid;font-size:.74rem;gap:4px}.cards-month-jump input{min-width:9.5rem}.cards-month-jump .sf-button{min-height:36px;white-space:nowrap}
    .cards-invoice-navigation .sf-tabs{display:flex;gap:6px;max-width:100%;overflow-x:auto;padding-bottom:2px}.cards-invoice-navigation .sf-tab{border:1px solid var(--line);border-radius:999px;flex:0 0 auto;font-size:.76rem;padding:6px 10px}.cards-invoice-navigation .sf-tab[aria-current="page"]{background:var(--primary-soft);border-color:var(--primary);color:var(--primary);font-weight:800}
    .cards-invoice-header{align-items:start;border-bottom:1px solid var(--line);display:grid;gap:12px;grid-template-columns:minmax(0,1fr) auto;padding:16px 18px}.cards-invoice-title-block{display:grid;gap:5px}.cards-invoice-title-row{align-items:center;display:flex;gap:8px}.cards-invoice-title-block h2{font-size:1.25rem}.cards-invoice-title-block p{color:var(--muted);font-size:.82rem}.cards-invoice-primary{display:grid;gap:4px;justify-items:end;min-width:230px}.cards-invoice-primary>span{color:var(--muted);font-size:.76rem}.cards-invoice-primary>strong{font-size:1.45rem}.cards-invoice-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end;margin-top:5px}.cards-settlement-note{background:var(--primary-soft);border-radius:var(--radius);font-size:.78rem;grid-column:1/-1;margin:0;padding:8px 10px}
    .cards-invoice-summary{border-bottom:1px solid var(--line);display:grid;gap:9px;padding:12px 18px}.cards-invoice-summary .sf-summary-grid{display:grid;gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))}.cards-summary-metric{background:var(--bg);border-radius:var(--radius);display:grid;gap:3px;padding:10px}.cards-summary-metric>span,.cards-summary-metric>small{color:var(--muted);font-size:.72rem}.cards-summary-metric>strong{font-size:.95rem}.cards-limit-detail{display:flex;flex-wrap:wrap;gap:14px}.cards-limit-detail>div{display:flex;font-size:.76rem;gap:5px}.cards-limit-detail dt{color:var(--muted)}.cards-limit-detail dd{font-weight:750}
    .cards-detail-panel .sf-filter-bar{border-bottom:1px solid var(--line);display:grid;gap:8px;padding:12px 18px}.cards-purchase-filter-form{align-items:end;display:grid;gap:8px;grid-template-columns:minmax(12rem,1.2fr) minmax(10rem,.7fr) minmax(10rem,.6fr) auto}.cards-purchase-filter-form label{display:grid;font-size:.76rem;gap:5px}.cards-purchase-filter-form input,.cards-purchase-filter-form select{width:100%}.cards-reconciliation-filters{align-items:center;display:flex;flex-wrap:wrap;gap:6px}.cards-filter-chip{align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:999px;display:inline-flex;font-size:.74rem;font-weight:700;gap:6px;min-height:32px;padding:4px 9px}.cards-filter-chip.is-active{background:var(--primary-soft);border-color:var(--primary);color:var(--primary)}.cards-filter-chip small{font-weight:800}.cards-results-status{color:var(--muted);font-size:.76rem;margin-left:auto}
    .cards-purchase-groups{display:grid;gap:10px;padding:14px 18px 18px}.cards-section-heading>span{color:var(--muted);font-size:.78rem;font-weight:750}.cards-instrument-group{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}.cards-instrument-group>summary{align-items:center;background:var(--bg);cursor:pointer;display:flex;gap:10px;justify-content:space-between;list-style:none;padding:10px 12px}.cards-instrument-group>summary::-webkit-details-marker{display:none}.cards-instrument-group>summary>div:first-child{display:grid;gap:2px}.cards-instrument-group>summary span{color:var(--muted);font-size:.72rem}.cards-instrument-totals{font-size:.82rem;font-weight:800;text-align:right}
    .cards-purchase-table{display:none}.cards-instrument-group[open]>.cards-purchase-table{display:grid}.cards-purchase-table-head,.cards-purchase-row{align-items:center;display:grid;gap:9px;grid-template-columns:6.5rem minmax(0,1fr) 8.5rem 9rem 3.5rem}.cards-purchase-table-head{border-bottom:1px solid var(--line);color:var(--muted);font-size:.7rem;font-weight:800;padding:7px 10px;text-transform:uppercase}.cards-purchase-row{border-bottom:1px solid var(--line);padding:9px 10px}.cards-purchase-row:last-child{border-bottom:0}.cards-purchase-row time{color:var(--muted);font-size:.8rem}.cards-purchase-description{display:grid;gap:2px;min-width:0}.cards-purchase-description strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cards-purchase-description>span{color:var(--muted);font-size:.76rem}.cards-purchase-amount{text-align:right}.cards-purchase-actions{position:relative;text-align:right}.cards-purchase-actions summary{align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:999px;cursor:pointer;display:inline-flex;height:30px;justify-content:center;list-style:none;width:30px}.cards-purchase-menu{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 12px 32px rgba(15,23,42,.14);display:grid;min-width:210px;padding:5px;position:absolute;right:0;top:34px;z-index:20}.cards-purchase-menu button{background:transparent;border:0;color:var(--text);font-size:.8rem;justify-content:flex-start;text-align:left}.cards-move-hint{border-top:1px solid var(--line);color:var(--muted);font-size:.68rem;padding:6px}
    .cards-purchase-empty{padding:18px}
    .cards-dialog{border:0;border-radius:var(--radius);max-height:90vh;max-width:min(680px,calc(100vw - 24px));padding:0;width:100%}.cards-dialog::backdrop{background:rgba(15,23,42,.45)}.cards-dialog-panel{display:grid;gap:14px;padding:18px}.cards-dialog-panel>header{align-items:start;display:flex;gap:12px;justify-content:space-between}.cards-dialog-panel h2{font-size:1.1rem}.cards-dialog-close{background:transparent;border:0;font-size:1.4rem;min-height:44px;min-width:44px}.cards-dialog form{display:grid;gap:10px;grid-template-columns:1fr 1fr}.cards-dialog form label{display:grid;gap:5px}.cards-dialog .full{grid-column:1/-1}.cards-payment-explanation{background:var(--primary-soft);border-radius:var(--radius);font-size:.82rem;padding:9px 10px}.form-status{min-height:20px}.success{color:var(--success)}.error{color:var(--danger)}.money-unavailable{color:var(--muted);font-size:.78rem}
    .cards-load-error{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:8px;padding:18px}.cards-load-error .sf-button{justify-self:start}
    @media(max-width:1050px){.cards-a3-page .sf-detail-layout{grid-template-columns:240px minmax(0,1fr)}.cards-invoice-summary .sf-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cards-purchase-table-head,.cards-purchase-row{grid-template-columns:5.5rem minmax(0,1fr) 7rem 8rem 3rem}.cards-purchase-filter-form{grid-template-columns:1fr 1fr}}
    @media(max-width:760px){.cards-a3-page{padding:12px}.cards-a3-page .sf-page-header{align-items:stretch;display:grid}.cards-a3-page .sf-page-header-actions{justify-content:stretch}.cards-a3-page .sf-page-header-actions .sf-button{width:100%}.cards-a3-page .sf-detail-layout{display:grid;grid-template-columns:1fr}.cards-master-panel{position:static}.cards-master-meta,.cards-instrument-nav{display:none}.cards-card-identity{grid-template-columns:auto minmax(0,1fr)}.cards-card-identity .sf-badge{grid-column:2}.cards-invoice-navigation-head{align-items:stretch;display:grid}.cards-month-jump{display:grid;grid-template-columns:minmax(0,1fr) auto}.cards-month-jump label{min-width:0}.cards-month-jump input{min-width:0;width:100%}.cards-invoice-header{grid-template-columns:1fr;padding:14px}.cards-invoice-primary{justify-items:start;min-width:0}.cards-invoice-actions{justify-content:flex-start}.cards-invoice-summary{padding:12px 14px}.cards-invoice-summary .sf-summary-grid{grid-template-columns:1fr 1fr}.cards-detail-panel .sf-filter-bar{padding:12px 14px}.cards-purchase-filter-form{grid-template-columns:1fr}.cards-reconciliation-filters{align-items:stretch}.cards-results-status{flex-basis:100%;margin-left:0}.cards-purchase-groups{padding:12px 14px}.cards-purchase-table-head{display:none}.cards-purchase-row{align-items:start;grid-template-columns:minmax(0,1fr) auto;padding:10px}.cards-purchase-row>[data-label]::before{color:var(--muted);content:attr(data-label);display:block;font-size:.66rem;font-weight:750;margin-bottom:2px;text-transform:uppercase}.cards-purchase-row time{grid-column:1}.cards-purchase-description{grid-column:1}.cards-purchase-row>[data-label="Situação"]{grid-column:1}.cards-purchase-amount{grid-column:2;grid-row:1;text-align:right}.cards-purchase-actions{grid-column:2;grid-row:2 / span 2}.cards-dialog form{grid-template-columns:1fr}.cards-dialog .full{grid-column:auto}}
    @media(max-width:430px){.cards-invoice-summary .sf-summary-grid{grid-template-columns:1fr}.cards-invoice-actions{display:grid;width:100%}.cards-invoice-actions .sf-button{width:100%}.cards-filter-chip{flex:1 1 auto;justify-content:center}}
  `;
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
