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
} from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import { attachmentWorkspaceScript, renderAttachmentWorkspace } from "./attachment-workspace.js";
import { findInstitution, renderInstitutionIcon } from "./institutions.js";
import { icon } from "./icons.js";
import {
  recurrencesSectionScript,
  renderRecurrenceActionMenuItems,
  renderRecurrenceEditModal,
  renderRecurrenceIndicator,
  type RecurrenceRecord,
} from "./recurrences-section.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { cardsPageStyles } from "./cards-page-v2-styles.js";

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
  currency?: string;
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
  parentCategoryId?: string;
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
  financialProfileId?: string;
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
  purchaseTotalAmountMinor?: number;
  installmentSequenceNumber?: number;
  totalInstallments?: number;
  installmentStart?: number;
  currency: string;
  status: string;
}
interface InvoiceInstallmentRecord {
  id: string;
  status: string;
  dueOn: string;
  sequenceNumber: number;
  totalInstallments: number;
  initialSequenceNumber?: number;
  amountMinor: number;
  currency: string;
  transaction?: CardPurchaseRecord;
  invoice?: { id: string };
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
  groupBy: "day" | "instrument";
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
    apiGet<{ creditCardAccounts: CardRecord[] }>(token, "/api/credit-card-accounts?status=all"),
    apiGet<{ invoices: InvoiceRecord[] }>(token, "/api/invoices?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);

  if (!cardsResult.ok) return renderErrorPage(cardsResult.error);
  if (!invoicesResult.ok) return renderErrorPage(invoicesResult.error);

  const cards = cardsResult.data.creditCardAccounts.filter((card) => card.status !== "archived");
  const invoices = invoicesResult.data.invoices;
  const selectedCard = resolveSelectedCard(cards, url.searchParams.get("cardId"));
  const cardCurrency = normalizeCurrency(selectedCard?.currency);
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

  const [summaryResult, purchasesResult, installmentsResult] = selectedInvoice
    ? await Promise.all([
        apiGet<{ summary: InvoiceSummaryRecord }>(
          token,
          `/api/invoices/${encodeURIComponent(selectedInvoice.id)}/summary`,
        ),
        apiGet<{ purchases: CardPurchaseRecord[] }>(
          token,
          `/api/invoices/${encodeURIComponent(selectedInvoice.id)}/purchases`,
        ),
        apiGet<{ installments: InvoiceInstallmentRecord[] }>(
          token,
          `/api/installments?invoiceId=${encodeURIComponent(selectedInvoice.id)}&status=all`,
        ),
      ])
    : ([
        { ok: true, data: { summary: undefined as InvoiceSummaryRecord | undefined } },
        { ok: true, data: { purchases: [] as CardPurchaseRecord[] } },
        { ok: true, data: { installments: [] as InvoiceInstallmentRecord[] } },
      ] as const);

  if (selectedInvoice && !accountsResult.ok) return renderErrorPage(accountsResult.error);
  if (selectedInvoice && !categoriesResult.ok) return renderErrorPage(categoriesResult.error);
  if (!summaryResult.ok) return renderErrorPage(summaryResult.error);
  if (!purchasesResult.ok) return renderErrorPage(purchasesResult.error);
  if (!installmentsResult.ok) return renderErrorPage(installmentsResult.error);

  const accounts = accountsResult.ok ? accountsResult.data.accounts : [];
  const reversalCategoriesResult = await apiGet<{ categories: CategoryRecord[] }>(
    token, "/api/categories?kind=income",
  );
  const categories = categoriesResult.ok
    ? [...categoriesResult.data.categories, ...(reversalCategoriesResult.ok
        ? reversalCategoriesResult.data.categories.filter((category) => category.name.trim().toLocaleLowerCase("pt-BR") === "estornos")
        : [])]
    : [];
  const summary = summaryResult.data.summary;
  // The original transaction amount is a historical base, not the effective total
  // after one or more installment amounts have been adjusted.
  const allCardInstallments = selectedCard && selectedInvoice
    ? await apiGet<{ installments: InvoiceInstallmentRecord[] }>(
        token, `/api/installments?cardId=${encodeURIComponent(selectedCard.id)}&status=all`,
      )
    : null;
  const effectiveTotals = new Map<string, number>();
  if (allCardInstallments?.ok) {
    for (const installment of allCardInstallments.data.installments ?? []) {
      const transactionId = installment.transaction?.id;
      if (!transactionId || !Number.isSafeInteger(installment.amountMinor)) continue;
      effectiveTotals.set(transactionId, (effectiveTotals.get(transactionId) ?? 0) + installment.amountMinor);
    }
  }
  const canonicalPurchases = projectInvoicePurchases(
    purchasesResult.data.purchases,
    installmentsResult.data.installments ?? [],
    effectiveTotals,
  );
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
    className: selectedInvoice ? "cards-a3-page cards-has-invoice" : "cards-a3-page",
    childrenHtml: `${renderPageHeader({
      title: "Cartões de Crédito",
      description: "Acompanhe as faturas, limites e compras dos seus cartões.",
      actionsHtml: selectedInvoice ? "" : renderPageActions(selectedCard, activeInstruments),
    })}${renderDetailLayout({
      masterHtml: renderCardMaster(
        cards,
        selectedCard,
        instruments,
        cardCurrency,
        invoiceCurrency,
        url,
      ),
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
        purchaseActionHtml: selectedInvoice
          ? renderPageActions(selectedCard, activeInstruments)
          : "",
        url,
      }),
    })}`,
  });

  return renderShell(`
    <div class="cards-layout" data-cards-archetype="A3">
      ${content}
      ${renderPurchaseModal(selectedCard, categoriesResult.ok ? categoriesResult.data.categories : [], activeInstruments, cardCurrency)}
      ${selectedInvoice ? renderInstallmentAmountModal() : ""}
      ${selectedInvoice ? renderInvoiceAttachmentsDialog(selectedInvoice) : ""}
      ${renderPaymentModal(
        selectedInvoice,
        matchingPaymentAccounts,
        summary?.amountDueMinor ?? selectedInvoice?.totalAmountMinor ?? 0,
        invoiceCurrency,
      )}
      ${renderRecurrenceEditModal(
        categories,
        "card",
        renderInstrumentOptions(activeInstruments, cardCurrency),
        cardCurrency ?? "moeda indisponível",
      )}
      ${clientScript()}
      ${attachmentWorkspaceScript()}
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

function projectInvoicePurchases(
  purchases: readonly CardPurchaseRecord[],
  installments: readonly InvoiceInstallmentRecord[],
  effectiveTotals: ReadonlyMap<string, number> = new Map(),
): CardPurchaseRecord[] {
  const installmentTransactionIds = new Set(
    installments.map((installment) => installment.transaction?.id).filter(isDefined),
  );
  const simpleAndRecurringPurchases = purchases.filter(
    (purchase) => !installmentTransactionIds.has(purchase.id),
  );
  const installmentOccurrences = installments.flatMap((installment) => {
    const purchase = installment.transaction;
    if (!purchase || !installment.invoice?.id || !purchase.cardId) return [];
    return [
      {
        ...purchase,
        invoiceId: installment.invoice.id,
        installmentId: installment.id,
        occurredOn: installment.dueOn,
        plannedOn: installment.dueOn,
        status: installment.status,
        amountMinor: installment.amountMinor,
        currency: installment.currency,
        purchaseTotalAmountMinor: effectiveTotals.get(purchase.id) ?? purchase.amountMinor,
        installmentSequenceNumber: installment.sequenceNumber,
        totalInstallments: installment.totalInstallments,
        installmentStart: installment.initialSequenceNumber ?? 1,
      },
    ];
  });

  return [...simpleAndRecurringPurchases, ...installmentOccurrences];
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

  const monthNow = currentMonth();
  return invoices.find((invoice) => invoice.periodEndOn.slice(0, 7) === monthNow);
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
    groupBy: url.searchParams.get("groupBy") === "instrument" ? "instrument" : "day",
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
            : formatInstrumentIdentity(instruments.find((instrument) => instrument.id === id)),
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
  const cardCurrency = normalizeCurrency(card?.currency);
  const disabled =
    !card || card.status !== "active" || instruments.length === 0 || cardCurrency === undefined;
  const reason = !card
    ? "Selecione um cartão"
    : cardCurrency === undefined
      ? "Defina a moeda padrão do cartão em Contas e Cartões"
      : instruments.length === 0
        ? "Cadastre um instrumento ativo em Contas e Cartões"
        : card.status !== "active"
          ? "O cartão selecionado não está ativo"
          : "Registrar compra neste cartão";
  return `<button type="button" class="sf-button sf-button-secondary" data-open-modal="purchase"${disabled ? " disabled" : ""} title="${escapeHtml(reason)}">Registrar compra</button>`;
}

function renderCardMaster(
  cards: readonly CardRecord[],
  selectedCard: CardRecord | undefined,
  instruments: readonly CardInstrumentRecord[],
  cardCurrency: string | undefined,
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
  const manageHref = selectedCard
    ? `/contas-cartoes?resource=${encodeURIComponent(`card:${selectedCard.id}`)}`
    : "/contas-cartoes";
  return `<section class="cards-master-panel" aria-labelledby="cards-master-title">
    <div class="cards-master-heading">
      <div><h2 id="cards-master-title">Cartão</h2></div>
      <a class="cards-edit-link" href="${escapeHtml(manageHref)}">Gerenciar</a>
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
      <div><strong>${escapeHtml(selectedCard.name)}</strong>${selectedCard.maskedIdentifier ? `<span>${escapeHtml(selectedCard.maskedIdentifier)}</span>` : ""}</div>
      ${renderBadge({
        label: formatCardStatus(selectedCard.status),
        tone: selectedCard.status === "active" ? "positive" : "attention",
      })}
    </div>`
        : ""
    }
    <details class="cards-master-details" open><summary>Dados do cartão</summary><dl class="cards-master-meta">
      <div><dt>Moeda padrão</dt><dd>${escapeHtml(cardCurrency ?? "Não informada")}</dd></div>
      <div><dt>Moeda da fatura</dt><dd>${escapeHtml(invoiceCurrency ?? "Indisponível")}</dd></div>
      <div><dt>Fechamento contratual</dt><dd>Dia ${escapeHtml(String(selectedCard?.closingDay ?? "-"))}</dd></div>
      <div><dt>Vencimento contratual</dt><dd>Dia ${escapeHtml(String(selectedCard?.dueDay ?? "-"))}</dd></div>
    </dl></details>
    ${
      selectedCard && !cardCurrency
        ? `<p class="cards-card-warning" role="status">Defina a moeda padrão deste cartão antes de registrar novas compras. <a href="${escapeHtml(manageHref)}">Editar cartão</a></p>`
        : ""
    }
    <details class="cards-instrument-nav" open>
      <summary>Instrumentos <span>${active.length} ativos</span></summary>
      <ul>
        ${
          active
            .map(
              (instrument) =>
                `<li>${renderInstrumentListLabel(instrument, cardCurrency)}${instrument.isDefault ? "<strong>Padrão</strong>" : ""}</li>`,
            )
            .join("") || "<li><span>Nenhum instrumento ativo.</span></li>"
        }
        ${archived
          .map(
            (instrument) =>
              `<li class="muted">${renderInstrumentListLabel(instrument, cardCurrency)}<small>Arquivado</small></li>`,
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
  purchaseActionHtml: string;
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
    <div class="cards-purchase-section-header">
      <div class="cards-purchase-title"><h3 id="cards-purchases-title">Itens da fatura</h3><span>${escapeHtml(input.currency ?? "Moeda indisponível")}</span></div>
      ${input.purchaseActionHtml}
    </div>
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
      input.presentation.sort,
      input.presentation.groupBy,
    )}
  </section>`;
}

function renderInvoiceAttachmentsDialog(invoice: InvoiceRecord): string {
  return `<dialog class="cards-dialog" data-modal="invoice-attachments" aria-labelledby="cards-attachment-dialog-title">
    <section class="cards-dialog-panel">
      <header><div><span class="cards-kicker">Fatura selecionada</span><h2 id="cards-attachment-dialog-title">Documentos da fatura</h2></div><button type="button" class="cards-dialog-close" data-close-modal aria-label="Fechar">×</button></header>
      ${renderAttachmentWorkspace({ entityKind: "invoice", entityId: invoice.id, title: "Anexos da fatura" })}
    </section>
  </dialog>`;
}

function renderInvoiceNavigation(
  invoices: readonly InvoiceRecord[],
  selectedInvoice: InvoiceRecord | undefined,
  cardId: string,
  url: URL,
): string {
  const firstMonth = currentMonth();
  const visibleInvoices = invoices
    .filter((invoice) => invoice.periodEndOn.slice(0, 7) >= firstMonth)
    .sort((left, right) => left.periodEndOn.localeCompare(right.periodEndOn));
  const selectedMonth =
    selectedInvoice?.periodEndOn.slice(0, 7) ??
    normalizeMonth(url.searchParams.get("month")) ??
    firstMonth;
  const periods = new Map<string, InvoiceRecord | undefined>();
  periods.set(
    firstMonth,
    visibleInvoices.find((invoice) => invoice.periodEndOn.slice(0, 7) === firstMonth),
  );
  for (const invoice of visibleInvoices) {
    periods.set(invoice.periodEndOn.slice(0, 7), invoice);
  }
  if (!periods.has(selectedMonth)) {
    periods.set(selectedMonth, selectedInvoice);
  }
  const orderedPeriods = [...periods.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const selectedIndex = Math.max(
    0,
    orderedPeriods.findIndex(([month]) => month === selectedMonth),
  );
  const historicalSelection = selectedMonth < firstMonth;
  const adjacentPeriod = (month: string, offset: number): [string, InvoiceRecord | undefined] => {
    const [year, monthNumber] = month.split("-").map(Number) as [number, number];
    const adjacentMonth = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
      .toISOString()
      .slice(0, 7);
    return [
      adjacentMonth,
      invoices.find((invoice) => invoice.periodEndOn.slice(0, 7) === adjacentMonth),
    ];
  };
  const previousPeriod = historicalSelection
    ? adjacentPeriod(selectedMonth, -1)
    : selectedIndex > 0
      ? orderedPeriods[selectedIndex - 1]
      : undefined;
  const nextPeriod = historicalSelection
    ? adjacentPeriod(selectedMonth, 1)
    : selectedIndex < orderedPeriods.length - 1
      ? orderedPeriods[selectedIndex + 1]
      : undefined;
  const navigationHref = ([month, invoice]: [string, InvoiceRecord | undefined]): string =>
    invoice ? buildInvoiceHref(url, cardId, invoice) : buildMonthHref(url, cardId, month);
  const profileId = url.searchParams.get("profileId");
  const status = selectedInvoice ? formatInvoiceStatus(selectedInvoice.status) : "Sem fatura";

  return `<div class="cards-invoice-navigation" data-invoice-navigation>
    <div class="cards-invoice-period-row" aria-label="Navegação entre faturas">
      ${
        previousPeriod
          ? `<a class="cards-invoice-period-link cards-invoice-period-link-previous" href="${escapeHtml(navigationHref(previousPeriod))}" rel="prev" aria-label="Fatura anterior: ${escapeHtml(formatMonth(previousPeriod[0]))}"><span aria-hidden="true">‹</span><span><strong>Anterior</strong><small>${escapeHtml(formatMonth(previousPeriod[0]))}</small></span></a>`
          : `<span class="cards-invoice-period-link cards-invoice-period-link-previous is-disabled" aria-disabled="true" aria-label="Sem fatura anterior"><span aria-hidden="true">‹</span><span><strong>Anterior</strong></span></span>`
      }
      <div class="cards-invoice-current" aria-current="page">
        <span class="cards-kicker">Fatura</span>
        <strong>${escapeHtml(formatMonth(selectedMonth))}</strong>
        <span class="cards-invoice-period-status">${escapeHtml(status)}</span>
      </div>
      ${
        nextPeriod
          ? `<a class="cards-invoice-period-link cards-invoice-period-link-next" href="${escapeHtml(navigationHref(nextPeriod))}" rel="next" aria-label="Próxima fatura: ${escapeHtml(formatMonth(nextPeriod[0]))}"><span><strong>Próxima</strong><small>${escapeHtml(formatMonth(nextPeriod[0]))}</small></span><span aria-hidden="true">›</span></a>`
          : `<span class="cards-invoice-period-link cards-invoice-period-link-next is-disabled" aria-disabled="true" aria-label="Sem próxima fatura"><span><strong>Próxima</strong></span><span aria-hidden="true">›</span></span>`
      }
    </div>
    <details class="cards-month-picker">
      <summary>Escolher outro mês</summary>
      <form method="get" action="/cartoes" class="cards-month-jump">
        <input type="hidden" name="cardId" value="${escapeHtml(cardId)}">
        ${profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(profileId)}">` : ""}
        <label for="cards-invoice-month">Mês e ano</label>
        <input id="cards-invoice-month" type="month" name="month" value="${escapeHtml(selectedMonth)}" data-invoice-month-input>
        <button type="submit" class="sf-button sf-button-secondary">Ir</button>
      </form>
    </details>
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
    <div class="cards-invoice-primary">
      <span>Valor a pagar</span>
      <strong>${money(amountDueMinor, currency)}</strong>
      ${canPay ? `<div class="cards-invoice-actions"><button type="button" class="sf-button sf-button-primary" data-open-modal="payment"${paymentAccounts.length > 0 ? "" : " disabled"} title="${paymentAccounts.length > 0 ? "Liquidar esta fatura" : "Cadastre uma conta ativa na mesma moeda da fatura"}">Liquidar fatura</button></div>` : ""}
    </div>
    <div class="cards-invoice-title-block">
      <div class="cards-invoice-title-row">
        <span class="cards-kicker">Situação da fatura</span>
        ${renderBadge({ label: formatInvoiceStatus(status), tone: invoiceTone(status) })}
      </div>
      <div class="cards-invoice-heading-row">
        <h2 id="cards-invoice-title">${escapeHtml(formatInvoicePeriod(invoice))}</h2>
      </div>
      <dl class="cards-invoice-metadata" aria-label="Datas e moeda da fatura">
        <div class="cards-invoice-due"><dt>Vencimento</dt><dd><time datetime="${escapeHtml(invoice.dueOn)}">${formatDate(invoice.dueOn)}</time></dd></div>
        <div class="cards-invoice-closing"><dt>Fechamento</dt><dd><time datetime="${escapeHtml(invoice.periodEndOn)}">${formatDate(invoice.periodEndOn)}</time></dd></div>
        <div class="cards-invoice-currency"><dt>Moeda</dt><dd>${escapeHtml(currency ?? "Indisponível")}</dd></div>
      </dl>
    </div>
    <div class="cards-invoice-secondary-actions" role="group" aria-label="Outras ações da fatura">
      <button type="button" class="cards-invoice-documents" data-open-modal="invoice-attachments" title="Gerenciar documentos desta fatura" aria-label="Documentos da fatura">${icon("file-text", 16)} <span>Documentos</span></button>
      ${canClose ? `<button type="button" class="sf-button sf-button-secondary cards-close-invoice" data-api-path="/api/invoices/${escapeHtml(invoice.id)}/close" data-confirm="Fechar esta fatura?">${icon("lock", 15)} Fechar fatura</button>` : ""}
      <details class="cards-settlement-note"><summary>Sobre a liquidação</summary><p><strong>Liquidação não é uma nova compra.</strong> O pagamento movimenta a conta escolhida e quita a fatura sem registrar uma segunda despesa econômica.</p></details>
    </div>
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
  const limitDetails =
    totals.length > 0
      ? `<details class="cards-limit-detail"><summary>Detalhes do limite</summary><dl><div><dt>Limite total</dt><dd>${money(limitTotal, currency)}</dd></div><div><dt>Limite utilizado</dt><dd>${money(limitUsed, currency)}</dd></div></dl></details>`
      : "";
  return `<section class="cards-invoice-summary" aria-label="Resumo da fatura">
    ${renderSummaryGrid({
      childrenHtml: [
        summaryMetric(
          "Total da fatura",
          money(summary?.totalExpensesMinor ?? invoice.totalAmountMinor, currency),
        ),
        summaryMetric("Conciliado", money(summary?.reconciledExpensesMinor ?? 0, currency)),
        summaryMetric("Não conciliado", money(summary?.unreconciledExpensesMinor ?? 0, currency)),
        summaryMetric(
          "Limite disponível",
          totals.length > 0 ? money(limitAvailable, currency) : "Indisponível",
          limitDetails,
        ),
      ].join(""),
    })}
  </section>`;
}

function summaryMetric(label: string, valueHtml: string, extraHtml = ""): string {
  return `<section class="cards-summary-metric"><div class="cards-summary-copy"><span>${escapeHtml(label)}</span><strong>${valueHtml}</strong>${extraHtml}</div></section>`;
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
  if (presentation.search) base.searchParams.set("q", presentation.search);
  if (presentation.sort !== "date_desc") base.searchParams.set("sort", presentation.sort);
  if (presentation.groupBy === "instrument") base.searchParams.set("groupBy", "instrument");
  if (presentation.day) base.searchParams.set("day", presentation.day);
  const controls = `<form method="get" action="/cartoes" class="cards-purchase-filter-form">
      <input type="hidden" name="cardId" value="${escapeHtml(cardId)}">
      <input type="hidden" name="invoiceId" value="${escapeHtml(invoice.id)}">
      <input type="hidden" name="reconciliation" value="${escapeHtml(presentation.reconciliation)}">
      ${profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(profileId)}">` : ""}
      <label class="cards-search-field" for="cards-purchase-search">Buscar compras
        <input id="cards-purchase-search" type="search" name="q" value="${escapeHtml(presentation.search)}" placeholder="Descrição ou categoria" data-purchase-search autocomplete="off">
      </label>
      <label class="cards-purchase-group-filter" for="cards-purchase-group">Agrupar por
        <select id="cards-purchase-group" name="groupBy" aria-label="Agrupar lançamentos por">
          <option value="day"${presentation.groupBy === "day" ? " selected" : ""}>Dia</option>
          <option value="instrument"${presentation.groupBy === "instrument" ? " selected" : ""}>Instrumento</option>
        </select>
      </label>
      <div class="cards-purchase-day-filter">
        <label for="cards-purchase-day">Dia da fatura
          <input id="cards-purchase-day" type="date" name="day" min="${escapeHtml(invoice.periodStartOn)}" max="${escapeHtml(invoice.periodEndOn)}" value="${escapeHtml(presentation.day ?? "")}">
        </label>
        ${presentation.day ? `<a class="cards-clear-day" href="${escapeHtml(withQuery(base, { day: null, reconciliation: presentation.reconciliation }))}" aria-label="Exibir todos os dias da fatura">Todos os dias</a>` : ""}
      </div>
      <details class="cards-advanced-filters"${presentation.sort !== "date_desc" ? " open" : ""}>
        <summary>Mais filtros${presentation.sort !== "date_desc" ? " · ativos" : ""}</summary>
        <div class="cards-advanced-fields">
      <label for="cards-purchase-sort">Ordenar
        <select id="cards-purchase-sort" name="sort">${renderSortOptions(presentation.sort)}</select>
      </label>
        </div>
      </details>
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
  sort: CardSort,
  groupBy: "day" | "instrument",
): string {
  if (groups.length === 0) {
    return `<div class="cards-purchase-empty" data-purchase-filter-empty>${renderEmptyState({
      title: "Nenhuma compra encontrada",
      description: "Ajuste os filtros ou registre uma compra para esta fatura.",
    })}</div>`;
  }
  const sharedHead = `<div class="cards-purchase-table-head" role="row"><span role="columnheader">Data</span><span role="columnheader">Compra</span><span role="columnheader">Instrumento</span><span role="columnheader">Categoria</span><span role="columnheader">Situação</span><span role="columnheader">Valor</span><span role="columnheader">Ações</span></div>`;
  if (groupBy === "instrument" || (sort !== "date_asc" && sort !== "date_desc")) {
    return `<section class="cards-purchase-groups" aria-labelledby="cards-purchases-title"><div class="cards-shared-table-head">${sharedHead}</div>
      ${groups
        .map((group) =>
          renderInstrumentGroup({ ...group, purchases: groupBy === "instrument" ? [...group.purchases].sort((a, b) => sort === "date_asc" ? a.occurredOn.localeCompare(b.occurredOn) : b.occurredOn.localeCompare(a.occurredOn)) : group.purchases }, categories, recurrences, invoices, selectedInvoice),
        )
        .join("")}
    </section>`;
  }
  const days = new Map<string, InstrumentPurchaseGroup[]>();
  for (const group of groups) {
    for (const purchase of group.purchases) {
      const dayGroups = days.get(purchase.occurredOn) ?? [];
      let dayInstrument = dayGroups.find((candidate) => candidate.id === group.id);
      if (!dayInstrument) {
        dayInstrument = { id: group.id, label: group.label, purchases: [] };
        dayGroups.push(dayInstrument);
      }
      dayInstrument.purchases.push(purchase);
      days.set(purchase.occurredOn, dayGroups);
    }
  }
  const orderedDays = [...days.keys()].sort((left, right) =>
    sort === "date_asc" ? left.localeCompare(right) : right.localeCompare(left),
  );
  return `<section class="cards-purchase-groups" aria-labelledby="cards-purchases-title" data-cards-day-groups><div class="cards-shared-table-head">${sharedHead}</div>
    ${orderedDays
      .map((date) => {
        const dayGroups = days.get(date) ?? [];
        const purchases = dayGroups.flatMap((group) => group.purchases);
        const totals = totalsByCurrency(purchases);
        return `<details class="cards-day-group" data-cards-day-group data-day="${escapeHtml(date)}" open>
          <summary><span class="cards-day-title"><time datetime="${escapeHtml(date)}">${formatDate(date)}</time><small>${formatPurchaseCount(purchases.length)}</small></span><strong>${totals.map(([currency, amount]) => money(amount, currency)).join(" · ")}</strong></summary>
          <div class="cards-day-content">
            <div class="cards-purchase-table" role="table" aria-label="Compras de ${formatDate(date)}">
              ${dayGroups.flatMap((group) =>
                group.purchases.map((purchase) =>
                  renderPurchaseRow(purchase, group.label, categories, recurrences, invoices, selectedInvoice),
                ),
              ).join("")}
            </div>
          </div>
        </details>`;
      })
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
      ${group.purchases
        .map((purchase) =>
          renderPurchaseRow(purchase, group.label, categories, recurrences, invoices, selectedInvoice),
        )
        .join("")}
    </div>
  </details>`;
}

function renderPurchaseRow(
  purchase: CardPurchaseRecord,
  instrumentLabel: string,
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
  const sequence = purchase.installmentSequenceNumber;
  const total = purchase.totalInstallments;
  const installmentLabel =
    !purchase.recurrenceId &&
    sequence !== undefined &&
    total !== undefined &&
    Number.isInteger(sequence) &&
    Number.isInteger(total) &&
    total > 1 &&
    sequence >= 1 &&
    sequence <= total
      ? `Parcela ${sequence} de ${total}`
      : undefined;
  return `<article class="cards-purchase-row" role="row" data-purchase-item data-reconciliation="${purchase.status === "reconciled" ? "reconciled" : "unreconciled"}">
    <time role="cell" data-label="Data" datetime="${escapeHtml(purchase.occurredOn)}">${formatDate(purchase.occurredOn)}</time>
    <div role="cell" data-label="Compra" class="cards-purchase-description description"><strong>${escapeHtml(purchase.description)}${installmentLabel ? ` <span class="installment-badge cards-installment-label" aria-label="${escapeHtml(installmentLabel)}" title="${escapeHtml(installmentLabel)}">${escapeHtml(installmentLabel)}</span>` : ""}${recurrence ? renderRecurrenceIndicator() : ""}</strong></div>
    <span role="cell" data-label="Instrumento" class="cards-purchase-instrument">${escapeHtml(instrumentLabel)}</span>
    <span role="cell" data-label="Categoria" class="cards-purchase-category" data-category-direction="out"><span class="cards-purchase-category-badge"><svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5v12"/><path d="m5.5 11 4.5 4.5L14.5 11"/></svg><span class="cards-purchase-category-label">${escapeHtml(category)}</span></span></span>
    <span role="cell" data-label="Situação" class="cards-purchase-status-cell">${renderPurchaseStatusControl(purchase, locked)}</span>
    <strong role="cell" data-label="Valor" class="cards-purchase-amount">${money(purchase.amountMinor, normalizeCurrency(purchase.currency))}</strong>
    <details class="cards-purchase-actions" role="cell" data-label="Ações"><summary aria-label="Ações da compra ${escapeHtml(purchase.description)}" title="Ações da compra">${icon("more-horizontal", 18)}</summary><div class="cards-purchase-menu actions-menu" role="menu">
      <button type="button" class="actions-item" role="menuitem" data-edit-purchase="${escapeHtml(purchase.id)}"${recurrence ? ` data-recurrence-id="${escapeHtml(recurrence.id)}"` : ""}${locked ? " disabled" : ""}>${icon("pencil", 16)}<span>Editar</span></button>
      <button type="button" class="actions-item" role="menuitem" data-clone-purchase="${escapeHtml(purchase.id)}"${locked ? " disabled" : ""}>${icon("copy", 16)}<span>Clonar</span></button>
      <button type="button" class="actions-item" role="menuitem" data-reverse-purchase="${escapeHtml(purchase.id)}"${locked || purchase.amountMinor <= 0 ? " disabled" : ""}>${icon("rotate-ccw", 16)}<span>Estorno</span></button>
      
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
  cardCurrency: string | undefined,
): string {
  const canSave = Boolean(selectedCard && instruments.length > 0 && cardCurrency);
  const cardSettingsHref = selectedCard
    ? `/contas-cartoes?resource=${encodeURIComponent(`card:${selectedCard.id}`)}`
    : "/contas-cartoes";
  return `<dialog class="cards-dialog" data-modal="purchase" aria-labelledby="cards-purchase-dialog-title" aria-describedby="cards-purchase-dialog-description">
    <section class="cards-dialog-panel cards-purchase-dialog-panel">
      <header class="cards-purchase-dialog-header"><div><span class="cards-kicker">Compra no cartão</span><h2 id="cards-purchase-dialog-title" data-purchase-modal-title>Registrar compra</h2><span class="cards-purchase-card-name">${escapeHtml(selectedCard?.name ?? "Cartão não selecionado")}</span></div><button type="button" class="cards-dialog-close" data-close-modal aria-label="Fechar">×</button></header>
      <p class="cards-dialog-description" id="cards-purchase-dialog-description" data-purchase-modal-description>Informe valor e dados da compra. A moeda segue a configuração do cartão.</p>
      <form data-purchase-form data-path="/api/credit-card-accounts/${escapeHtml(selectedCard?.id ?? "")}/purchases">
        <input type="hidden" name="currentPurchaseId"><input type="hidden" name="recurrenceId">
        <div class="cards-purchase-form-body">
          <fieldset class="cards-purchase-fieldset cards-purchase-amounts">
            <legend>Valores</legend>
            <div class="cards-purchase-field-grid">
        <label><span data-purchase-amount-label>Valor${cardCurrency ? ` (${escapeHtml(cardCurrency)})` : ""}</span><input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00"></label>
        <label data-purchase-field="installmentAmountMinor" hidden>Valor desta parcela${cardCurrency ? ` (${escapeHtml(cardCurrency)})` : ""}<input name="installmentAmountMinor" data-money inputmode="decimal"></label>
            </div>
          </fieldset>
          <fieldset class="cards-purchase-fieldset">
            <legend>Dados da compra</legend>
            <div class="cards-purchase-field-grid">
        <label>Moeda<input name="currency" value="${escapeHtml(cardCurrency ?? "")}" minlength="3" maxlength="3" pattern="[A-Za-z]{3}" required readonly aria-readonly="true" autocomplete="off"></label>
        <label>Data<input name="occurredOn" type="date" required data-default-local-today></label>
        <p class="cards-purchase-date-help full" data-purchase-field="recurrenceDateHint" hidden>A alteração da data da compra recorrente respeitará o período da fatura. Ao salvar, escolha entre somente esta ocorrência e as próximas elegíveis.</p>
        <label class="full">Descrição<input name="description" required placeholder="Descreva a compra"></label>
            </div>
          </fieldset>
          <fieldset class="cards-purchase-fieldset">
            <legend>Classificação</legend>
            <div class="cards-purchase-field-grid">
        <label>Instrumento<select name="cardInstrumentId"${instruments.length === 0 ? " disabled" : " required"}>${renderInstrumentOptions(instruments, cardCurrency)}</select></label>
        <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
            </div>
          </fieldset>
          <fieldset class="cards-purchase-fieldset" data-purchase-section="schedule">
            <legend>Repetição e parcelas</legend>
            <div class="cards-purchase-field-grid">
        <label>Repetição<select name="repeatMode"><option value="single">Único</option><option value="installment">Parcelado</option><option value="fixed">Fixo</option></select></label>
        <label data-purchase-field="totalInstallments" hidden>Parcelas<input name="totalInstallments" type="number" min="2" max="120" value="2"></label>
        <label data-purchase-field="installmentStart" hidden>Parcela inicial<input name="installmentStart" type="number" min="1" max="120" value="1"></label>
        <label data-purchase-field="installmentValueMode" hidden>Interpretação do valor<select name="installmentValueMode"><option value="total" selected>Valor total da compra</option><option value="per_installment">Valor da parcela</option></select><small data-installment-value-help>O valor será dividido pelo total de parcelas.</small></label>
        <p class="cards-installment-context cards-purchase-installment-note full" data-purchase-field="installmentContext" hidden aria-live="polite"></p>
        <label data-purchase-field="interval" hidden>A cada<input name="interval" type="number" min="1" max="60" value="1"></label>
        <label data-purchase-field="frequency" hidden>Frequência<select name="frequency"><option value="daily">Dia(s)</option><option value="weekly">Semana(s)</option><option value="monthly" selected>Mês(es)</option><option value="yearly">Ano(s)</option></select></label>
        <label data-purchase-field="endOn" hidden>Fim opcional<input name="endOn" type="date"></label>
            </div>
          </fieldset>
        ${
          selectedCard && !cardCurrency
            ? `<p class="form-status error full" role="status">Defina a moeda padrão do cartão antes de registrar uma compra. <a href="${escapeHtml(cardSettingsHref)}">Editar cartão em Contas e Cartões</a>.</p>`
            : ""
        }
        <p class="form-status full" data-form-status aria-live="polite"></p>
        </div>
        <footer class="cards-purchase-dialog-actions">
          <button class="sf-button sf-button-secondary" type="button" data-close-modal>Cancelar</button>
          <button class="sf-button sf-button-primary" type="submit"${canSave ? "" : " disabled"}>Salvar compra</button>
        </footer>
      </form>
    </section>
  </dialog>`;
}

function renderInstallmentAmountModal(): string {
  return `<dialog class="cards-dialog cards-installment-amount-dialog" data-modal="installment-value" aria-labelledby="cards-installment-value-title" aria-describedby="cards-installment-value-help">
    <section class="cards-dialog-panel cards-purchase-dialog-panel">
      <header class="cards-purchase-dialog-header"><div><span class="cards-kicker">Ajuste de parcela</span><h2 id="cards-installment-value-title">Editar valor da parcela</h2><span class="cards-purchase-card-name" data-installment-purchase-name></span></div><button type="button" class="cards-dialog-close" data-close-modal aria-label="Fechar">×</button></header>
      <p class="cards-dialog-description" id="cards-installment-value-help">Ajuste somente esta parcela ou também as próximas parcelas elegíveis. Faturas fechadas e parcelas conciliadas não serão alteradas.</p>
      <form data-installment-amount-form>
        <div class="cards-purchase-form-body">
          <fieldset class="cards-purchase-fieldset cards-purchase-amounts">
            <legend>Valor desta parcela</legend>
            <div class="cards-purchase-field-grid">
              <label>Valor na moeda da fatura<input name="amountMinor" data-money inputmode="decimal" required aria-label="Novo valor da parcela" placeholder="0,00"></label>
            </div>
            <p class="cards-purchase-installment-note" data-installment-scope-description aria-live="polite"></p>
          </fieldset>
          <p class="form-status" data-installment-amount-status role="status" aria-live="polite"></p>
        </div>
        <footer class="cards-purchase-dialog-actions cards-installment-scope-actions">
          <button type="button" class="sf-button sf-button-secondary" data-close-modal>Cancelar</button>
          <button type="button" class="sf-button sf-button-secondary" data-installment-scope="current">Somente esta</button>
          <button type="button" class="sf-button sf-button-secondary" data-installment-scope="current_and_future">Esta e as próximas</button>
        </footer>
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
  return `<dialog class="cards-dialog" data-modal="payment" aria-labelledby="cards-payment-dialog-title" aria-describedby="cards-payment-dialog-description">
    <section class="cards-dialog-panel">
      <header><div><span class="cards-kicker">Liquidação da fatura</span><h2 id="cards-payment-dialog-title">Liquidar fatura</h2></div><button type="button" class="cards-dialog-close" data-close-modal aria-label="Fechar">×</button></header>
      <p id="cards-payment-dialog-description" class="cards-payment-explanation">O pagamento reduz o saldo da conta escolhida e liquida a fatura. Ele não cria outra compra nem duplica a despesa já reconhecida.</p>
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
  const activeCategories = categories.filter(
    (category) => category.status === undefined || category.status === "active",
  );
  return buildCategoryHierarchy(activeCategories)
    .map(({ category, path }) => {
      const label = path.length > 1 ? path.join(" › ") : category.name;
      return `<option value="${escapeHtml(category.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}
function buildCategoryHierarchy(
  categories: readonly CategoryRecord[],
): Array<{ category: CategoryRecord; path: string[] }> {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string | undefined, CategoryRecord[]>();
  const rootKey = undefined;

  for (const category of categories) {
    const parentId =
      category.parentCategoryId &&
      category.parentCategoryId !== category.id &&
      categoryById.has(category.parentCategoryId)
        ? category.parentCategoryId
        : rootKey;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(category);
    childrenByParent.set(parentId, children);
  }

  const ordered: Array<{ category: CategoryRecord; path: string[] }> = [];
  const visited = new Set<string>();
  const visit = (category: CategoryRecord, path: string[]): void => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    const nextPath = [...path, category.name];
    ordered.push({ category, path: nextPath });
    for (const child of childrenByParent.get(category.id) ?? []) {
      visit(child, nextPath);
    }
  };

  for (const root of childrenByParent.get(rootKey) ?? []) {
    visit(root, []);
  }

  for (const category of categories) {
    if (!visited.has(category.id)) visit(category, []);
  }

  return ordered;
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

function formatInstrumentIdentity(instrument: CardInstrumentRecord | undefined): string {
  if (!instrument) return "Instrumento arquivado ou indisponível";
  const title =
    instrument.name?.trim() ||
    `${formatInstrumentType(instrument.type)} - ${formatInstrumentHolder(instrument.holder)}`;
  return `${title}${instrument.maskedIdentifier ? ` · ${instrument.maskedIdentifier}` : ""}`;
}
function formatInstrumentLimit(
  instrument: CardInstrumentRecord | undefined,
  currency: string | undefined,
): string | undefined {
  if (instrument?.effectiveCreditLimitMinor === undefined) return undefined;
  return currency
    ? `Limite ${currency} ${formatMinorNumber(instrument.effectiveCreditLimitMinor)}`
    : "Limite com moeda indisponível";
}
function formatInstrumentLabel(
  instrument: CardInstrumentRecord | undefined,
  currency: string | undefined,
): string {
  const identity = formatInstrumentIdentity(instrument);
  const limit = formatInstrumentLimit(instrument, currency);
  return limit ? `${identity} · ${limit}` : identity;
}
function renderInstrumentListLabel(
  instrument: CardInstrumentRecord,
  currency: string | undefined,
): string {
  const limit = formatInstrumentLimit(instrument, currency);
  return `<span class="cards-instrument-copy"><span class="cards-instrument-name">${escapeHtml(formatInstrumentIdentity(instrument))}</span>${limit ? `<small class="cards-instrument-limit">${escapeHtml(limit)}</small>` : ""}</span>`;
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
function buildMonthHref(url: URL, cardId: string, month: string): string {
  const next = new URL(url);
  next.pathname = "/cartoes";
  next.search = "";
  next.searchParams.set("cardId", cardId);
  next.searchParams.set("month", month);
  const profileId = url.searchParams.get("profileId");
  if (profileId) next.searchParams.set("profileId", profileId);
  return `${next.pathname}${next.search}`;
}
function withQuery(base: URL, changes: Record<string, string | null>): string {
  const next = new URL(base);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) next.searchParams.delete(name);
    else next.searchParams.set(name, value);
  }
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
function renderPurchaseStatusIcon(status: string): string {
  const label = escapeHtml(formatPurchaseStatus(status));
  const kind = status === "reconciled" ? "reconciled" : status === "planned" ? "planned" : "posted";
  const pictogram =
    kind === "reconciled"
      ? icon("check", 15)
      : kind === "planned"
        ? icon("clock", 15)
        : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
  return `<span class="cards-purchase-status cards-purchase-status-${kind}" role="img" aria-label="${label}" title="${label}" data-tooltip="${label}">${pictogram}</span>`;
}

function renderPurchaseStatusControl(purchase: CardPurchaseRecord, invoiceLocked: boolean): string {
  const currentStatus = formatPurchaseStatus(purchase.status);
  const eligibleStatus = ["planned", "posted", "reconciled"].includes(purchase.status);
  const allowed = !invoiceLocked && eligibleStatus;
  const nextStatus = purchase.status === "reconciled" ? "posted" : "reconciled";
  const actionLabel = nextStatus === "reconciled" ? "Marcar como conciliada" : "Desconciliar";
  const nextIcon = renderPurchaseStatusIcon(nextStatus);
  const explanation = invoiceLocked
    ? "A situação não pode ser alterada porque a fatura está fechada, paga ou cancelada."
    : "Esta situação não pode ser alterada.";
  const actionHtml = allowed
    ? `<button type="button" class="cards-purchase-status-option" data-button-variant="neutral" data-set-purchase-status="${nextStatus}" data-status-purchase-id="${escapeHtml(purchase.id)}" data-status-card-id="${escapeHtml(purchase.cardId)}"${purchase.installmentId ? ` data-status-installment-id="${escapeHtml(purchase.installmentId)}" data-status-invoice-id="${escapeHtml(purchase.invoiceId ?? "")}"` : ""} aria-label="${actionLabel}" title="${actionLabel}" data-tooltip="${actionLabel}">${nextIcon}</button>`
    : `<span class="cards-purchase-status-readonly" role="img" aria-label="${explanation}" title="${explanation}" data-tooltip="${explanation}">${icon("lock", 15)}</span>`;
  return `<details class="cards-purchase-status-control" data-purchase-status-control>
    <summary aria-label="Situação: ${escapeHtml(currentStatus)}. ${allowed ? "Alterar situação" : "Ver restrição de alteração"}" title="${escapeHtml(currentStatus)}">${renderPurchaseStatusIcon(purchase.status)}</summary>
    <div class="cards-purchase-status-menu" role="group" aria-label="Situação da compra">
      <span class="cards-purchase-status-current" role="img" aria-label="Situação atual: ${escapeHtml(currentStatus)}" title="${escapeHtml(currentStatus)}" data-tooltip="${escapeHtml(currentStatus)}">${renderPurchaseStatusIcon(purchase.status)}</span>
      ${actionHtml}
      <span class="cards-purchase-status-feedback" role="status" aria-live="polite" hidden><span class="cards-status-feedback-icon" aria-hidden="true">${icon("clock", 15)}</span><span class="sf-visually-hidden" data-cards-status-feedback-message></span></span>
    </div>
  </details>`;
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
    styles: cardsPageStyles(),
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
      const localToday = () => {
        const now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      };
      document.querySelectorAll("[data-money]").forEach((input) => input.addEventListener("input", () => {
        const digits = input.value.replace(/\\D/g, "");
        input.value = minorToMoney(digits ? Number.parseInt(digits, 10) : 0);
      }));
      document.querySelector("[data-card-select]")?.addEventListener("change", (event) => event.target.form?.requestSubmit());
      if (window.matchMedia("(max-width: 760px)").matches) {
        document.querySelectorAll(".cards-master-details,.cards-instrument-nav").forEach((details) => { details.open = false; });
      }

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
        const help = purchaseForm?.querySelector("[data-installment-value-help]");
        const valueMode = purchaseForm?.querySelector('[name="installmentValueMode"]')?.value;
        if (help) help.textContent = valueMode === "per_installment"
          ? "O valor informado será aplicado a cada parcela e o total da compra será calculado."
          : "O valor será dividido pelo total de parcelas.";
      };
      repeatMode?.addEventListener("change", syncRepeatFields);
      purchaseForm?.querySelector('[name="installmentValueMode"]')?.addEventListener("change", syncRepeatFields);
      const resetPurchaseForm = () => {
        if (!purchaseForm) return;
        purchaseForm.reset();
        purchaseForm.dataset.method = "POST";
        const defaultPath = purchaseForm.getAttribute("data-path") || "";
        purchaseForm.dataset.path = defaultPath;
        purchaseForm.dataset.currentPurchaseId = "";
        purchaseForm.dataset.recurrenceId = "";
        purchaseForm.dataset.installmentPurchase = "false";
        purchaseForm.dataset.installmentId = "";
        purchaseForm.dataset.invoiceId = "";
        purchaseForm.dataset.originalInstallmentAmount = "";
        document.querySelector('dialog[data-modal="purchase"]')?.removeAttribute("data-editing");
        setField("recurrenceDateHint", false);
        purchaseForm.querySelector('[name="currentPurchaseId"]').value = "";
        purchaseForm.querySelector('[name="recurrenceId"]').value = "";
        const occurredOnField = purchaseForm.querySelector('[name="occurredOn"]');
        if (occurredOnField) { occurredOnField.value = localToday(); occurredOnField.readOnly = false; }
        const amountField = purchaseForm.querySelector('[name="amountMinor"]');
        if (amountField) amountField.readOnly = false;
        const amountLabel = purchaseForm.querySelector("[data-purchase-amount-label]");
        const amountCurrency = purchaseForm.querySelector('[name="currency"]')?.value || "";
        if (amountLabel) amountLabel.textContent = "Valor" + (amountCurrency ? " (" + amountCurrency + ")" : "");
        ["totalInstallments", "installmentStart"].forEach((name) => {
          const field = purchaseForm.querySelector('[name="' + name + '"]');
          if (field) field.readOnly = false;
        });
        if (repeatMode) repeatMode.disabled = false;
        if (repeatMode?.closest("label")) repeatMode.closest("label").hidden = false;
        const currencyField = purchaseForm.querySelector('[name="currency"]');
        if (currencyField) currencyField.disabled = false;
        document.querySelector("[data-purchase-modal-title]").textContent = "Registrar compra";
        const purchaseDescription = document.querySelector("[data-purchase-modal-description]");
        if (purchaseDescription) purchaseDescription.textContent = "Informe valor e dados da compra. A moeda segue a configuração do cartão.";
        const scheduleSection = purchaseForm.querySelector('[data-purchase-section="schedule"]');
        if (scheduleSection) scheduleSection.hidden = false;
        setField("installmentAmountMinor", false);
        setField("installmentContext", false);
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

      const installmentDialog = document.querySelector('dialog[data-modal="installment-value"]');
      const installmentAmountForm = installmentDialog?.querySelector("[data-installment-amount-form]");
      document.querySelectorAll("[data-purchase]").forEach((node) => {
        const purchase = JSON.parse(node.textContent || "{}");
        const cloneButton = document.querySelector('[data-clone-purchase="' + purchase.id + '"]');
        cloneButton?.addEventListener("click", () => {
          if (cloneButton.disabled || !purchaseForm) return;
          resetPurchaseForm();
          purchaseForm.querySelector('[name="amountMinor"]').value = minorToMoney(purchase.amountMinor);
          purchaseForm.querySelector('[name="occurredOn"]').value = purchase.occurredOn;
          purchaseForm.querySelector('[name="description"]').value = purchase.description || "";
          purchaseForm.querySelector('[name="categoryId"]').value = purchase.categoryId || "";
          if (purchase.cardInstrumentId) purchaseForm.querySelector('[name="cardInstrumentId"]').value = purchase.cardInstrumentId;
          document.querySelector("[data-purchase-modal-title]").textContent = "Clonar compra";
          const description = document.querySelector("[data-purchase-modal-description]");
          if (description) description.textContent = "Confira os dados e registre uma nova compra única. Parcelas e recorrências não serão copiadas.";
          lastDialogTrigger = cloneButton;
          document.querySelector('dialog[data-modal="purchase"]')?.showModal();
        });

        const reverseButton = document.querySelector('[data-reverse-purchase="' + purchase.id + '"]');
        reverseButton?.addEventListener("click", async () => {
          if (reverseButton.disabled || !purchase.invoiceId || purchase.amountMinor <= 0) return;
          if (!window.confirm("Estornar " + purchase.description + " no valor de " + minorToMoney(purchase.amountMinor) + "? O crédito será lançado na mesma fatura.")) return;
          reverseButton.disabled = true;
          try {
            const response = await fetch("/api/credit-card-accounts/" + encodeURIComponent(purchase.cardId) + "/purchases/" + encodeURIComponent(purchase.id) + "/reverse", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ invoiceId: purchase.invoiceId, ...(purchase.installmentId ? { installmentId: purchase.installmentId } : {}) }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
              window.alert(result?.error?.message || "Não foi possível estornar o lançamento.");
              reverseButton.disabled = false;
              return;
            }
            window.location.reload();
          } catch {
            window.alert("Falha de conexão ao registrar o estorno.");
            reverseButton.disabled = false;
          }
        });
        const button = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
        if (!button || button.disabled || !purchaseForm) return;
        button.addEventListener("click", () => {
          purchaseForm.reset();
          purchaseForm.dataset.path = "/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id;
          purchaseForm.dataset.method = "PATCH";
          document.querySelector('dialog[data-modal="purchase"]')?.setAttribute("data-editing", "true");
          purchaseForm.dataset.currentPurchaseId = purchase.id;
          purchaseForm.dataset.recurrenceId = purchase.recurrenceId || "";
          const isInstallmentPurchase = !purchase.recurrenceId && Number.isInteger(purchase.installmentSequenceNumber) && Number.isInteger(purchase.totalInstallments) && purchase.totalInstallments > 1;
          purchaseForm.dataset.installmentPurchase = isInstallmentPurchase ? "true" : "false";
          purchaseForm.dataset.installmentId = isInstallmentPurchase ? (purchase.installmentId || "") : "";
          purchaseForm.dataset.invoiceId = isInstallmentPurchase ? (purchase.invoiceId || "") : "";
          purchaseForm.dataset.originalInstallmentAmount = isInstallmentPurchase ? String(purchase.amountMinor) : "";
          purchaseForm.querySelector('[name="currentPurchaseId"]').value = purchase.id;
          purchaseForm.querySelector('[name="recurrenceId"]').value = purchase.recurrenceId || "";
          purchaseForm.querySelector('[name="amountMinor"]').value = minorToMoney(isInstallmentPurchase ? (purchase.purchaseTotalAmountMinor ?? purchase.amountMinor) : purchase.amountMinor);
          purchaseForm.querySelector('[name="amountMinor"]').readOnly = isInstallmentPurchase;
          purchaseForm.querySelector('[name="occurredOn"]').readOnly = isInstallmentPurchase;
          purchaseForm.querySelector('[name="occurredOn"]').value = purchase.occurredOn;
          purchaseForm.querySelector('[name="description"]').value = purchase.description || "";
          purchaseForm.querySelector('[name="categoryId"]').value = purchase.categoryId || "";
          if (purchase.cardInstrumentId) purchaseForm.querySelector('[name="cardInstrumentId"]').value = purchase.cardInstrumentId;
          const currencyField = purchaseForm.querySelector('[name="currency"]');
          if (currencyField) {
            currencyField.value = purchase.currency || currencyField.value;
            currencyField.disabled = true;
          }
          if (repeatMode?.closest("label")) repeatMode.closest("label").hidden = !isInstallmentPurchase;
          const scheduleSection = purchaseForm.querySelector('[data-purchase-section="schedule"]');
          if (scheduleSection) scheduleSection.hidden = true;
          setField("recurrenceDateHint", Boolean(purchase.recurrenceId));
          if (isInstallmentPurchase) {
            repeatMode.value = "installment";
            repeatMode.disabled = true;
            purchaseForm.querySelector('[name="amountMinor"]').readOnly = true;
            purchaseForm.querySelector('[name="occurredOn"]').readOnly = true;
            purchaseForm.querySelector('[name="totalInstallments"]').value = purchase.totalInstallments;
            purchaseForm.querySelector('[name="totalInstallments"]').readOnly = true;
            purchaseForm.querySelector('[name="installmentStart"]').value = purchase.installmentStart || 1;
            purchaseForm.querySelector('[name="installmentStart"]').readOnly = true;
            purchaseForm.querySelector('[name="installmentAmountMinor"]').value = minorToMoney(purchase.amountMinor);
          }
          syncRepeatFields();
          if (isInstallmentPurchase) {
            setField("installmentValueMode", false);
            // Keep the occurrence amount editable in the purchase form.
            setField("installmentAmountMinor", true);
            setField("installmentContext", true);
            const context = purchaseForm.querySelector('[data-purchase-field="installmentContext"]');
            if (context) context.textContent = "Parcela " + purchase.installmentSequenceNumber + " de " + purchase.totalInstallments + ". Ao salvar o valor, escolha quais parcelas serão alteradas.";
            const amountLabel = purchaseForm.querySelector("[data-purchase-amount-label]");
            const amountCurrency = purchaseForm.querySelector('[name="currency"]')?.value || "";
            if (amountLabel) amountLabel.textContent = "Valor total da compra" + (amountCurrency ? " (" + amountCurrency + ")" : "");
          } else {
            setField("installmentAmountMinor", false);
            setField("installmentContext", false);
          }
          document.querySelector("[data-purchase-modal-title]").textContent = "Editar compra";
          const purchaseDescription = document.querySelector("[data-purchase-modal-description]");
          if (purchaseDescription) purchaseDescription.textContent = isInstallmentPurchase
            ? "Atualize os dados e o valor da parcela. Ao salvar, escolha o alcance da alteração."
            : "Atualize os dados da compra e salve as alterações.";
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

      installmentAmountForm?.querySelectorAll("[data-installment-scope]").forEach((button) => button.addEventListener("click", async () => {
        const valueField = installmentAmountForm.querySelector('[name="amountMinor"]');
        const status = installmentAmountForm.querySelector("[data-installment-amount-status]");
        const amountMinor = moneyToMinor(valueField.value);
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
          status.textContent = "Informe um valor positivo para a parcela.";
          status.className = "form-status error";
          valueField.focus();
          return;
        }
        const invoiceId = installmentAmountForm.dataset.invoiceId;
        const installmentId = installmentAmountForm.dataset.installmentId;
        if (!invoiceId || !installmentId) return;
        const buttons = installmentAmountForm.querySelectorAll("[data-installment-scope]");
        buttons.forEach((item) => { item.disabled = true; });
        status.textContent = "Atualizando valor...";
        status.className = "form-status";
        try {
          const response = await request(
            "/api/invoices/" + encodeURIComponent(invoiceId) + "/installments/" + encodeURIComponent(installmentId) + "/amount",
            "PATCH",
            { amountMinor, scope: button.dataset.installmentScope },
          );
          const result = await response.json().catch(() => ({}));
          status.textContent = response.ok
            ? "Valor atualizado. " + (result.updatedCount || 0) + " parcela(s) alterada(s)." +
              (result.skippedCount ? " " + result.skippedCount + " parcela(s) bloqueada(s) preservada(s)." : "")
            : (result.error?.message || "Não foi possível atualizar a parcela.");
          status.className = response.ok ? "form-status success" : "form-status error";
          if (response.ok && installmentAmountForm.dataset.pendingPurchasePayload) {
            const metadataResponse = await request(installmentAmountForm.dataset.pendingPurchasePath, "PATCH", JSON.parse(installmentAmountForm.dataset.pendingPurchasePayload));
            if (!metadataResponse.ok) {
              status.textContent = "Valor atualizado, mas outros dados não foram salvos: " + await responseMessage(metadataResponse);
              status.className = "form-status error";
              return;
            }
          }
          if (response.ok) window.setTimeout(() => window.location.reload(), 350);
          else buttons.forEach((item) => { item.disabled = false; });
        } catch {
          status.textContent = "Falha de conexão. Tente novamente.";
          status.className = "form-status error";
          buttons.forEach((item) => { item.disabled = false; });
        }
      }));

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
        if (method === "POST" && !/^[A-Z]{3}$/.test(currency)) {
          status.textContent = "Defina a moeda padrão do cartão em Contas e Cartões antes de salvar a compra.";
          status.className = "form-status error full";
          return;
        }
        const editingInstallment = method === "PATCH" && purchaseForm.dataset.installmentPurchase === "true";
        const payload = { description: String(data.get("description") || "") };
        if (!editingInstallment) {
          payload.amountMinor = moneyToMinor(data.get("amountMinor"));
          payload.occurredOn = String(data.get("occurredOn") || "");
        }
        const categoryId = String(data.get("categoryId") || "");
        const cardInstrumentId = String(data.get("cardInstrumentId") || "");
        if (categoryId) payload.categoryId = categoryId;
        if (cardInstrumentId) payload.cardInstrumentId = cardInstrumentId;
        if (method === "POST") payload.currency = currency;
        if (editingInstallment) {
          const nextAmount = moneyToMinor(data.get("installmentAmountMinor"));
          if (!Number.isSafeInteger(nextAmount) || nextAmount <= 0) {
            status.textContent = "Informe um valor positivo para a parcela.";
            status.className = "form-status error full";
            return;
          }
          if (nextAmount !== Number(purchaseForm.dataset.originalInstallmentAmount)) {
            if (!installmentAmountForm || !installmentDialog || !purchaseForm.dataset.invoiceId || !purchaseForm.dataset.installmentId) {
              status.textContent = "Não foi possível identificar esta parcela.";
              status.className = "form-status error full";
              return;
            }
            installmentAmountForm.dataset.invoiceId = purchaseForm.dataset.invoiceId;
            installmentAmountForm.dataset.installmentId = purchaseForm.dataset.installmentId;
            installmentAmountForm.dataset.pendingPurchasePath = path;
            installmentAmountForm.dataset.pendingPurchasePayload = JSON.stringify(payload);
            installmentAmountForm.querySelector('[name="amountMinor"]').value = minorToMoney(nextAmount);
            installmentDialog.querySelector("[data-installment-purchase-name]").textContent = payload.description;
            installmentAmountForm.querySelector("[data-installment-scope-description]").textContent = "Aplicar o novo valor somente nesta parcela ou também nas próximas elegíveis?";
            installmentAmountForm.querySelector("[data-installment-amount-status]").textContent = "";
            purchaseForm.closest("dialog")?.close();
            installmentDialog.showModal();
            return;
          }
        }
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

      // Status-only reconciliation follows the Golden Screen. For finite installments,
      // use the occurrence-specific route so sibling invoices are unaffected.
      document.querySelectorAll("[data-set-purchase-status]").forEach((button) => {
        button.addEventListener("click", async () => {
          const control = button.closest("[data-purchase-status-control]");
          const feedback = control?.querySelector(".cards-purchase-status-feedback");
          const message = feedback?.querySelector("[data-cards-status-feedback-message]");
          const targetStatus = button.dataset.setPurchaseStatus;
          const purchaseId = button.dataset.statusPurchaseId;
          const cardId = button.dataset.statusCardId;
          if (!control || !feedback || !message || !purchaseId || !cardId ||
              !["posted", "reconciled"].includes(targetStatus)) return;
          const showFeedback = (text, tone) => {
            feedback.hidden = false;
            feedback.className = "cards-purchase-status-feedback" + (tone ? " " + tone : "");
            message.textContent = text;
            feedback.title = text;
            feedback.dataset.tooltip = text;
          };
          const buttons = Array.from(control.querySelectorAll("[data-set-purchase-status]"));
          buttons.forEach((item) => { item.disabled = true; });
          showFeedback("Atualizando situação...", "");
          try {
            const installmentId = button.dataset.statusInstallmentId;
            const invoiceId = button.dataset.statusInvoiceId;
            const path = installmentId && invoiceId
              ? "/api/invoices/" + encodeURIComponent(invoiceId) +
                "/installments/" + encodeURIComponent(installmentId) + "/reconciliation"
              : "/api/credit-card-accounts/" + encodeURIComponent(cardId) +
                "/purchases/" + encodeURIComponent(purchaseId);
            const response = await request(path, "PATCH", { status: targetStatus });
            if (!response.ok) {
              showFeedback(await responseMessage(response), "error");
              buttons.forEach((item) => { item.disabled = false; });
              return;
            }
            showFeedback("Situação atualizada. Atualizando fatura...", "success");
            window.setTimeout(() => window.location.reload(), 350);
          } catch {
            showFeedback("Falha de conexão. Tente novamente.", "error");
            buttons.forEach((item) => { item.disabled = false; });
          }
        });
      });
      document.querySelectorAll("[data-purchase-status-control]").forEach((control) => {
        control.addEventListener("toggle", () => {
          if (!control.open) return;
          document.querySelectorAll("[data-purchase-status-control]").forEach((other) => {
            if (other !== control) other.open = false;
          });
        });
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
        document.querySelectorAll(".cards-purchase-actions[open],.cards-purchase-status-control[open]").forEach((details) => {
          if (!details.contains(event.target)) details.removeAttribute("open");
        });
      });
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".cards-purchase-actions[open],.cards-purchase-status-control[open]").forEach((details) => {
          const summary = details.querySelector("summary");
          details.removeAttribute("open");
          summary?.focus();
        });
      });
      syncRepeatFields();
    })();
  </script>`;
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
