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

export async function renderCardsPage(token: string, url?: URL): Promise<string> {
  const [cardsResult, invoicesResult, categoriesResult, accountsResult, linksResult] =
    await Promise.all([
      apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
      apiGet<{ invoices: InvoiceRecord[] }>(token, "/api/invoices?status=all"),
      apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
      apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
      apiGet<{ links: CardAdditionalLinkRecord[] }>(token, "/api/card-additional-links"),
    ]);

  if (!cardsResult.ok) return renderErrorPage(cardsResult.error);
  if (!invoicesResult.ok) return renderErrorPage(invoicesResult.error);

  const cards = cardsResult.data.cards;
  const invoices = invoicesResult.data.invoices;
  const categories = categoriesResult.ok ? (categoriesResult.data.categories ?? []) : [];
  const accounts = accountsResult.ok ? (accountsResult.data.accounts ?? []) : [];
  const links = linksResult.ok ? (linksResult.data.links ?? []) : [];
  const additionalCardIds = new Set(
    links.filter((link) => link.cardId !== link.groupCardId).map((link) => link.cardId),
  );

  const selectedCard = resolveSelectedCard(cards, url?.searchParams.get("cardId") ?? undefined);
  const familyCardIds = resolveFamilyCardIds(selectedCard?.id, links);
  const familyInvoices = invoices.filter((invoice) => familyCardIds.has(invoice.cardId));
  const cardInvoices = dedupeInvoicesByPeriod(familyInvoices, selectedCard?.id);
  const selectedInvoice = resolveSelectedInvoice(
    cardInvoices,
    url?.searchParams.get("invoiceId") ?? undefined,
  );
  const periodInvoices = selectedInvoice
    ? familyInvoices.filter((invoice) => invoice.periodEndOn === selectedInvoice.periodEndOn)
    : [];

  // Fetching recurrences first triggers the API's catch-up materialization of any due
  // installment into a real Transaction, so it must run before the purchases fetch below
  // in order for newly materialized purchases to show up in this same render.
  const recurrencesResult = selectedCard
    ? await apiGet<{ recurrences: RecurrenceRecord[] }>(
        token,
        `/api/recurrences?cardId=${selectedCard.id}&status=all`,
      )
    : { ok: true as const, data: { recurrences: [] as RecurrenceRecord[] } };
  const recurrences: RecurrenceRecord[] = recurrencesResult.ok
    ? recurrencesResult.data.recurrences
    : [];

  const [summaryResult, purchasesResults] = await Promise.all([
    selectedInvoice
      ? apiGet<{ summary: InvoiceSummaryRecord }>(
          token,
          `/api/invoices/${selectedInvoice.id}/summary`,
        )
      : Promise.resolve({ ok: true, data: { summary: undefined } } as const),
    Promise.all(
      periodInvoices.map((invoice) =>
        apiGet<{ purchases: CardPurchaseRecord[] }>(token, `/api/invoices/${invoice.id}/purchases`),
      ),
    ),
  ]);

  const summary =
    summaryResult.ok && summaryResult.data.summary
      ? summaryResult.data.summary
      : selectedInvoice
        ? fallbackSummary(selectedInvoice)
        : undefined;
  const failedPurchasesResult = purchasesResults.find((result) => !result.ok);
  const purchasesOk = failedPurchasesResult === undefined;
  const purchases = purchasesOk
    ? purchasesResults
        .flatMap((result) => (result.ok ? result.data.purchases : []))
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
    : [];

  return renderShell(
    `
      <section class="cards-heading">
        <div>
          <p class="eyebrow">Rotina de cartões</p>
          <h1>Cartões de Crédito</h1>
          <p class="muted">Acompanhe a fatura do cartão, registre compras e faça a baixa do pagamento.</p>
        </div>
        <button type="button" data-open-modal="purchase"${selectedCard ? "" : " disabled"}>Nova compra</button>
      </section>

      <section class="panel card-filter">
        <form class="filter-form" method="get" action="/cartoes" data-auto-submit>
          ${renderCardPicker(cards, additionalCardIds, selectedCard)}
          <div class="month-field">
            <label id="invoice-period-label">Fatura</label>
            <div class="month-nav">
              <button type="button" class="icon-btn" data-invoice-step="-1" aria-label="Fatura anterior">&#8249;</button>
              <span class="month-current" data-invoice-period-text>${selectedInvoice ? escapeHtml(formatMonthYear(selectedInvoice.periodEndOn)) : "Sem faturas"}</span>
              <button type="button" class="icon-btn" data-invoice-step="1" aria-label="Próxima fatura">&#8250;</button>
            </div>
          </div>
          <input type="hidden" name="invoiceId" value="${escapeHtml(selectedInvoice?.id ?? "")}" data-invoice-input />
          <script type="application/json" data-invoice-options>${serializeScriptJson(cardInvoices.map((invoice) => ({ id: invoice.id, label: formatMonthYear(invoice.periodEndOn) })))}</script>
        </form>
      </section>

      <section class="cards-layout">
        ${renderSummaryPanel(summary, selectedInvoice, accounts)}
        <section class="panel invoice-panel">
          <div class="invoice-toolbar">
            <div>
              <p class="eyebrow">Compras</p>
              <h2>${selectedCard ? `Fatura de ${escapeHtml(selectedCard.name)}` : "Selecione um cartão"}</h2>
              ${familyCardIds.size > 1 ? `<p class="muted">Fatura consolidada com os cartões adicionais do grupo.</p>` : ""}
            </div>
            <div class="filter-controls">
              <input type="search" data-purchase-search placeholder="Buscar descrição, categoria ou cartão" />
              <button type="button" class="toggle-chip" data-reconciliation-toggle="unreconciled" aria-pressed="true">Não conciliados</button>
              <button type="button" class="toggle-chip" data-reconciliation-toggle="reconciled" aria-pressed="true">Conciliados</button>
            </div>
          </div>
          <div class="purchase-list" aria-label="Compras da fatura">
            ${
              purchasesOk
                ? renderPurchaseListBody(purchases, categories, cards, selectedInvoice, recurrences)
                : `<p class="error" role="alert">${escapeHtml(failedPurchasesResult && !failedPurchasesResult.ok ? failedPurchasesResult.error : "Não foi possível carregar as compras.")}</p>`
            }
          </div>
        </section>
      </section>
      ${renderPurchaseModal(selectedCard, cards, additionalCardIds, links, categories)}
      ${renderPaymentModal(selectedInvoice, accounts, summary?.amountDueMinor ?? 0)}
      ${renderRecurrenceEditModal(categories, "card")}
      ${clientScript()}
      ${recurrencesSectionScript()}
    `,
  );
}

function resolveSelectedCard(
  cards: CardRecord[],
  cardId: string | undefined,
): CardRecord | undefined {
  if (cardId) {
    const requested = cards.find((card) => card.id === cardId);
    if (requested) return requested;
  }

  return cards.find((card) => card.status === "active") ?? cards[0];
}

function resolveSelectedInvoice(
  cardInvoices: InvoiceRecord[],
  invoiceId: string | undefined,
): InvoiceRecord | undefined {
  if (invoiceId) {
    const requested = cardInvoices.find((invoice) => invoice.id === invoiceId);
    if (requested) return requested;
  }

  return cardInvoices.find((invoice) => invoice.status === "open") ?? cardInvoices[0];
}

function dedupeInvoicesByPeriod(
  familyInvoices: InvoiceRecord[],
  preferredCardId: string | undefined,
): InvoiceRecord[] {
  const byPeriod = new Map<string, InvoiceRecord>();

  for (const invoice of familyInvoices) {
    const existing = byPeriod.get(invoice.periodEndOn);
    if (existing === undefined || invoice.cardId === preferredCardId) {
      byPeriod.set(invoice.periodEndOn, invoice);
    }
  }

  return Array.from(byPeriod.values()).sort((a, b) => b.periodEndOn.localeCompare(a.periodEndOn));
}

function renderCardPicker(
  cards: CardRecord[],
  additionalCardIds: ReadonlySet<string>,
  selectedCard: CardRecord | undefined,
): string {
  const triggerIcon = renderInstitutionIcon(findInstitution(selectedCard?.institutionKey).key);

  return `
    <div class="account-field" data-card-picker>
      <label id="card-picker-label">Cartão</label>
      <div class="account-select">
        <button type="button" class="account-select-trigger" data-card-trigger aria-haspopup="listbox" aria-expanded="false" aria-labelledby="card-picker-label">
          <span class="account-select-icon">${triggerIcon}</span>
          <span class="account-select-text">${selectedCard ? escapeHtml(selectedCard.name) : "Selecione um cartão"}</span>
          <svg class="account-select-chevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <input type="hidden" name="cardId" value="${escapeHtml(selectedCard?.id ?? "")}" required data-card-input />
        <ul class="account-select-menu" role="listbox" hidden data-card-menu aria-labelledby="card-picker-label">
          ${cards.map((card) => renderCardOption(card, additionalCardIds, selectedCard?.id)).join("")}
        </ul>
      </div>
      <a class="ghost-link" href="/contas-cartoes" title="Editar cadastro do cartão" aria-label="Editar cadastro do cartão">${renderPencilIcon()}</a>
    </div>
  `;
}

function renderCardOption(
  card: CardRecord,
  additionalCardIds: ReadonlySet<string>,
  selectedId: string | undefined,
): string {
  const institution = findInstitution(card.institutionKey);

  return `
    <li role="option" tabindex="-1" data-card-option="${escapeHtml(card.id)}" data-card-name="${escapeHtml(card.name)}" aria-selected="${selectedId === card.id}">
      <span class="account-select-icon">${renderInstitutionIcon(institution.key)}</span>
      <span>${escapeHtml(card.name)}${card.maskedIdentifier ? ` · ${escapeHtml(card.maskedIdentifier)}` : ""}${additionalCardIds.has(card.id) ? " · Adicional" : ""}</span>
    </li>
  `;
}

function renderSummaryPanel(
  summary: InvoiceSummaryRecord | undefined,
  invoice: InvoiceRecord | undefined,
  accounts: AccountRecord[],
): string {
  if (!summary || !invoice) {
    return `
      <aside class="panel invoice-summary" aria-label="Resumo da fatura">
        ${renderEmptyState("Nenhuma fatura disponível.", "Cadastre um cartão em Contas e Cartões e registre a primeira compra.")}
      </aside>
    `;
  }

  const canClose = invoice.status === "open";
  const canPay = invoice.status !== "paid" && invoice.status !== "cancelled";
  const totalLimitMinor = summary.cardTotals.reduce((sum, total) => sum + total.limitTotalMinor, 0);
  const totalUsedMinor = summary.cardTotals.reduce((sum, total) => sum + total.limitUsedMinor, 0);
  const totalAvailableMinor = Math.max(0, totalLimitMinor - totalUsedMinor);

  return `
    <aside class="panel invoice-summary" aria-label="Resumo da fatura">
      <section class="summary-block">
        <p class="eyebrow">Fatura ${escapeHtml(formatGenericStatus(summary.status))}</p>
        <h2>Fatura atual (R$)</h2>
        <dl class="summary-list">
          ${summaryRow("Fechamento", formatDate(summary.closingOn))}
          ${summaryRow("Vencimento", formatDate(summary.dueOn))}
          ${summaryRow("Saldo anterior", formatMoney(summary.previousBalanceMinor))}
          ${summaryRow("Total pago", formatMoney(summary.totalPaidMinor))}
          ${summaryRow("Total", formatMoney(-summary.totalExpensesMinor), "debit")}
          ${summaryRow("Valor a pagar", formatMoney(-summary.amountDueMinor), "debit", true)}
        </dl>
        <div class="invoice-actions">
          ${canClose ? renderActionButton("Fechar fatura", `/api/invoices/${invoice.id}/close`, "Fechar esta fatura?") : ""}
          ${canPay ? `<button type="button" data-open-modal="payment">Lançar pagamento</button>` : `<p class="muted">Pagamento indisponível para faturas ${escapeHtml(formatGenericStatus(invoice.status).toLowerCase())}.</p>`}
        </div>
      </section>

      <section class="summary-block">
        <h2>Detalhamento</h2>
        <dl class="summary-list">
          ${summaryRow("Despesas", formatMoney(-summary.totalExpensesMinor), "debit")}
          ${summaryRow("Total conciliado", formatMoney(-summary.reconciledExpensesMinor), "debit")}
          ${summaryRow("Total não conciliado", formatMoney(-summary.unreconciledExpensesMinor), "debit")}
        </dl>
      </section>

      <section class="summary-block">
        <h2>Totais por cartão (R$)</h2>
        <dl class="summary-list">
          ${summary.cardTotals.map((total) => summaryRow(`${total.cardName}${total.maskedIdentifier ? ` - ${total.maskedIdentifier}` : ""}`, formatMoney(-total.invoiceTotalMinor), total.invoiceTotalMinor > 0 ? "debit" : undefined)).join("") || `<p class="muted">Sem dados de limite.</p>`}
        </dl>
      </section>

      ${
        summary.cardTotals.length > 0
          ? `
        <section class="summary-block">
          <h2>Limite (Total)</h2>
          <dl class="summary-list">
            ${summaryRow("Limite da conta", formatMoney(totalLimitMinor))}
            ${summaryRow("Utilizado", formatMoney(-totalUsedMinor), "debit")}
            ${summaryRow("Disponível", formatMoney(totalAvailableMinor), "credit")}
          </dl>
        </section>
      `
          : ""
      }
      ${accounts.length === 0 ? `<p class="muted">Cadastre uma conta para registrar o pagamento da fatura.</p>` : ""}
    </aside>
  `;
}

function summaryRow(label: string, value: string, tone?: string, emphasis = false): string {
  return `<div class="summary-row${emphasis ? " summary-row-strong" : ""}"><dt>${escapeHtml(label)}</dt><dd${tone ? ` class="${tone}"` : ""}>${value}</dd></div>`;
}

function renderPurchaseListBody(
  purchases: CardPurchaseRecord[],
  categories: CategoryRecord[],
  cards: CardRecord[],
  selectedInvoice: InvoiceRecord | undefined,
  recurrences: RecurrenceRecord[],
): string {
  if (purchases.length === 0) {
    return renderEmptyState(
      selectedInvoice ? "Nenhuma compra nesta fatura." : "Nenhuma fatura para este cartão.",
      selectedInvoice
        ? "Registre uma compra para acompanhar valor, categoria e conciliação."
        : "A primeira compra registrada gera a fatura automaticamente.",
    );
  }

  const groups = groupPurchasesByCard(purchases);

  if (groups.length < 2) {
    return purchases
      .map((purchase) => renderPurchaseRow(purchase, categories, cards, false, recurrences))
      .join("");
  }

  return groups.map((group) => renderPurchaseGroup(group, categories, cards, recurrences)).join("");
}

function groupPurchasesByCard(
  purchases: CardPurchaseRecord[],
): { cardId: string; cardPurchases: CardPurchaseRecord[] }[] {
  const order: string[] = [];
  const cardPurchasesByCardId = new Map<string, CardPurchaseRecord[]>();

  for (const purchase of purchases) {
    let cardPurchases = cardPurchasesByCardId.get(purchase.cardId);
    if (cardPurchases === undefined) {
      cardPurchases = [];
      cardPurchasesByCardId.set(purchase.cardId, cardPurchases);
      order.push(purchase.cardId);
    }
    cardPurchases.push(purchase);
  }

  return order.map((cardId) => ({
    cardId,
    cardPurchases: cardPurchasesByCardId.get(cardId) ?? [],
  }));
}

function renderPurchaseGroup(
  group: { cardId: string; cardPurchases: CardPurchaseRecord[] },
  categories: CategoryRecord[],
  cards: CardRecord[],
  recurrences: RecurrenceRecord[],
): string {
  const cardName = cards.find((card) => card.id === group.cardId)?.name ?? "Cartão";
  const totalMinor = group.cardPurchases.reduce((sum, purchase) => sum + purchase.amountMinor, 0);
  const purchaseCountLabel =
    group.cardPurchases.length === 1 ? "1 compra" : `${group.cardPurchases.length} compras`;

  return `
    <details class="purchase-group" open>
      <summary class="purchase-group-summary">
        <span class="purchase-group-name">${escapeHtml(cardName)}</span>
        <span class="muted">${purchaseCountLabel}</span>
        <strong class="debit">${formatMoney(-totalMinor)}</strong>
      </summary>
      <div class="purchase-group-rows">
        ${group.cardPurchases.map((purchase) => renderPurchaseRow(purchase, categories, cards, false, recurrences)).join("")}
      </div>
    </details>
  `;
}

function renderPurchaseRow(
  purchase: CardPurchaseRecord,
  categories: CategoryRecord[],
  cards: CardRecord[],
  showCardLabel: boolean,
  recurrences: RecurrenceRecord[],
): string {
  const categoryName = purchase.categoryId
    ? categories.find((category) => category.id === purchase.categoryId)?.name
    : undefined;
  const cardName = cards.find((card) => card.id === purchase.cardId)?.name;
  const reconciliation = purchase.status === "reconciled" ? "reconciled" : "unreconciled";
  const search = [purchase.description, categoryName ?? "", purchase.status, cardName ?? ""]
    .join(" ")
    .toLowerCase();
  const subtitle =
    showCardLabel && cardName
      ? `${categoryName ?? "Sem categoria"} · ${cardName}`
      : (categoryName ?? "Sem categoria");
  const recurrence = purchase.recurrenceId
    ? recurrences.find((candidate) => candidate.id === purchase.recurrenceId)
    : undefined;

  return `
    <article class="purchase-row" data-purchase-item data-reconciliation="${reconciliation}" data-search="${escapeHtml(search)}">
      <time datetime="${escapeHtml(purchase.occurredOn)}">${formatDate(purchase.occurredOn)}</time>
      <div class="description">
        <strong>${escapeHtml(purchase.description)}${recurrence ? renderRecurrenceIndicator() : ""}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <span class="chip chip-${reconciliation === "reconciled" ? "ok" : "posted"}">${escapeHtml(formatGenericStatus(purchase.status))}</span>
      <strong class="debit">${formatMoney(-purchase.amountMinor)}</strong>
      <details class="actions">
        <summary aria-label="Ações da compra ${escapeHtml(purchase.description)}">${renderDotsIcon()}</summary>
        <div class="actions-menu" role="menu">
          <button type="button" class="actions-item" data-edit-purchase="${escapeHtml(purchase.id)}">${renderEditIcon()}<span>Editar</span></button>
          ${recurrence ? renderRecurrenceActionMenuItems(recurrence) : ""}
        </div>
      </details>
      <script type="application/json" data-purchase="${escapeHtml(purchase.id)}">${serializeScriptJson(purchase)}</script>
    </article>
  `;
}

function renderPurchaseModal(
  selectedCard: CardRecord | undefined,
  cards: CardRecord[],
  additionalCardIds: ReadonlySet<string>,
  links: CardAdditionalLinkRecord[],
  categories: CategoryRecord[],
): string {
  const familyCardIds = resolveFamilyCardIds(selectedCard?.id, links);
  const familyCards = cards.filter((card) => familyCardIds.has(card.id));

  return `
    <dialog data-modal="purchase">
      <section class="modal-panel">
        <form method="dialog" class="close-form"><button type="submit">Fechar</button></form>
        <div>
          <p class="eyebrow">Compra no cartão</p>
          <h2 data-purchase-modal-title>Nova compra</h2>
        </div>
        <form data-purchase-form data-path="/api/cards/${escapeHtml(selectedCard?.id ?? "")}/purchases">
          <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>
          <label>Data<input name="occurredOn" type="date" required /></label>
          <label class="full">Descrição<input name="description" placeholder="Compra no cartão" required /></label>
          <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
          ${
            familyCards.length > 1
              ? `<label>Cartão<select name="purchaseCardId">${familyCards.map((card) => `<option value="${escapeHtml(card.id)}"${card.id === selectedCard?.id ? " selected" : ""}>${escapeHtml(card.name)}${card.maskedIdentifier ? ` · ${escapeHtml(card.maskedIdentifier)}` : ""}${additionalCardIds.has(card.id) ? " · Adicional" : ""}</option>`).join("")}</select></label>`
              : ""
          }
          <label>Repetição<select name="repeatMode"><option value="single">Único</option><option value="installment">Parcelado</option><option value="fixed">Fixo</option></select></label>
          <label data-purchase-field="totalInstallments" hidden>Parcelas<input name="totalInstallments" type="number" min="2" max="120" value="2" /></label>
          <label data-purchase-field="installmentStart" hidden>Parcela inicial<input name="installmentStart" type="number" min="1" max="120" value="1" /></label>
          <label data-purchase-field="installmentValueMode" hidden>Valor informado<select name="installmentValueMode"><option value="per_installment">Valor da parcela</option><option value="total">Valor total (dividir pelas parcelas)</option></select></label>
          <label data-purchase-field="interval" hidden>A cada<input name="interval" type="number" min="1" max="60" value="1" /></label>
          <label data-purchase-field="frequency" hidden>Frequência<select name="frequency"><option value="daily">Dia(s)</option><option value="weekly">Semana(s)</option><option value="monthly" selected>Mês(es)</option><option value="yearly">Ano(s)</option></select></label>
          <label data-purchase-field="endOn" hidden>Fim opcional<input name="endOn" type="date" /></label>
          <button type="submit" class="full">Salvar compra</button>
        </form>
      </section>
    </dialog>
  `;
}

function renderPaymentModal(
  invoice: InvoiceRecord | undefined,
  accounts: AccountRecord[],
  amountDueMinor: number,
): string {
  return `
    <dialog data-modal="payment">
      <section class="modal-panel">
        <form method="dialog" class="close-form"><button type="submit">Fechar</button></form>
        <div>
          <p class="eyebrow">Pagamento de fatura</p>
          <h2>Lançar pagamento</h2>
        </div>
        <form data-path="/api/invoices/${escapeHtml(invoice?.id ?? "")}/pay" data-confirm="Registrar o pagamento desta fatura?">
          <label>Conta<select name="paymentAccountId" required>${renderAccountOptions(accounts)}</select></label>
          <label>Pago em<input name="paidOn" type="date" required /></label>
          <label>Valor pago (R$)<input name="amountMinor" data-money inputmode="decimal" value="${formatMoneyInput(amountDueMinor)}" required /></label>
          <label class="full">Descrição<input name="description" value="Pagamento da fatura ${invoice ? formatDate(invoice.periodEndOn) : ""}" /></label>
          <button type="submit" class="full">Confirmar pagamento</button>
        </form>
      </section>
    </dialog>
  `;
}

function resolveFamilyCardIds(
  cardId: string | undefined,
  links: CardAdditionalLinkRecord[],
): Set<string> {
  if (!cardId) return new Set();

  const membership = links.find((link) => link.cardId === cardId);
  const groupCardId = membership?.groupCardId ?? cardId;
  const family = links
    .filter((link) => link.groupCardId === groupCardId)
    .map((link) => link.cardId);

  return new Set(family.length > 0 ? family : [cardId]);
}

function renderActionButton(label: string, path: string, confirmation?: string): string {
  return `<button type="button" class="secondary-button" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}"${confirmation ? ` data-api-confirm="${escapeHtml(confirmation)}"` : ""}>${escapeHtml(label)}</button>`;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function renderAccountOptions(accounts: AccountRecord[]): string {
  return accounts
    .map(
      (account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`,
    )
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[]): string {
  return buildCategoryHierarchy(categories)
    .map(({ category, depth }) => {
      const indent = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
      return `<option value="${escapeHtml(category.id)}">${indent}${escapeHtml(category.name)}</option>`;
    })
    .join("");
}

function buildCategoryHierarchy(
  categories: CategoryRecord[],
): { category: CategoryRecord; depth: number }[] {
  const childrenByParent = new Map<string | undefined, CategoryRecord[]>();
  for (const category of categories) {
    const key = category.parentCategoryId;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), category]);
  }

  const rows: { category: CategoryRecord; depth: number }[] = [];
  function walk(parentId: string | undefined, depth: number): void {
    for (const category of childrenByParent.get(parentId) ?? []) {
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  }
  walk(undefined, 0);

  return rows;
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
    `<section class="panel"><p class="eyebrow">Erro ao carregar dados</p><h1>Cartões de Crédito</h1><p class="error">${escapeHtml(error)}</p><a class="button-link" href="/cartoes">Tentar novamente</a></section>`,
  );
}

function clientScript(): string {
  return `
    <script>
      function moneyToMinor(value) {
        const normalized = String(value).replace(/\\./g, "").replace(",", ".");
        return Math.round(parseFloat(normalized || "0") * 100);
      }

      function minorToMoneyInput(amountMinor) {
        return (amountMinor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      document.querySelectorAll("[data-money]").forEach((input) => {
        input.addEventListener("input", () => {
          const digits = input.value.replace(/\\D/g, "");
          const cents = digits ? parseInt(digits, 10) : 0;
          input.value = minorToMoneyInput(cents);
        });
      });

      function setupSelect(rootSelector, triggerSelector, menuSelector, inputSelector, optionSelector) {
        const root = document.querySelector(rootSelector);
        if (!root) return;
        const trigger = root.querySelector(triggerSelector);
        const triggerIcon = trigger.querySelector(".account-select-icon");
        const triggerText = trigger.querySelector(".account-select-text");
        const menu = root.querySelector(menuSelector);
        const input = root.querySelector(inputSelector);

        function close() {
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
        }

        trigger.addEventListener("click", () => {
          const isOpen = !menu.hidden;
          menu.hidden = isOpen;
          trigger.setAttribute("aria-expanded", String(!isOpen));
        });

        menu.querySelectorAll(optionSelector).forEach((option) => option.addEventListener("click", () => {
          const id = option.dataset.cardOption || option.dataset.accountOption;
          menu.querySelectorAll(optionSelector).forEach((node) => node.setAttribute("aria-selected", String(node === option)));
          triggerIcon.innerHTML = option.querySelector(".account-select-icon").innerHTML;
          triggerText.textContent = option.dataset.cardName || option.dataset.accountName;
          close();
          if (input.value !== id) {
            input.value = id;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }));

        document.addEventListener("click", (event) => {
          if (!root.contains(event.target)) close();
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") close();
        });
      }

      setupSelect("[data-card-picker]", "[data-card-trigger]", "[data-card-menu]", "[data-card-input]", "[data-card-option]");

      document.querySelectorAll("[data-auto-submit]").forEach((autoForm) => autoForm.addEventListener("change", (event) => {
        if (event.target.name === "cardId") {
          autoForm.querySelector("[data-invoice-input]").value = "";
          autoForm.requestSubmit();
        }
      }));

      const invoiceOptions = JSON.parse(document.querySelector("[data-invoice-options]").textContent || "[]");
      const invoiceInput = document.querySelector("[data-invoice-input]");
      const invoicePeriodText = document.querySelector("[data-invoice-period-text]");

      document.querySelectorAll("[data-invoice-step]").forEach((button) => button.addEventListener("click", () => {
        if (invoiceOptions.length === 0) return;
        const currentIndex = Math.max(0, invoiceOptions.findIndex((item) => item.id === invoiceInput.value));
        const delta = Number(button.dataset.invoiceStep);
        const nextIndex = (currentIndex - delta + invoiceOptions.length) % invoiceOptions.length;
        invoiceInput.value = invoiceOptions[nextIndex].id;
        invoicePeriodText.textContent = invoiceOptions[nextIndex].label;
        invoiceInput.closest("form").requestSubmit();
      }));

      const purchaseSearch = document.querySelector("[data-purchase-search]");
      const reconciliationToggles = Array.from(document.querySelectorAll("[data-reconciliation-toggle]"));

      function applyPurchaseFilters() {
        const query = String(purchaseSearch.value || "").trim().toLowerCase();
        const activeStatuses = reconciliationToggles
          .filter((toggle) => toggle.getAttribute("aria-pressed") === "true")
          .map((toggle) => toggle.dataset.reconciliationToggle);
        document.querySelectorAll("[data-purchase-item]").forEach((item) => {
          const matchesText = !query || item.dataset.search.includes(query);
          const matchesStatus = activeStatuses.includes(item.dataset.reconciliation);
          item.hidden = !(matchesText && matchesStatus);
        });
      }

      purchaseSearch && purchaseSearch.addEventListener("input", applyPurchaseFilters);
      reconciliationToggles.forEach((toggle) => toggle.addEventListener("click", () => {
        toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
        applyPurchaseFilters();
      }));

      document.querySelectorAll(".actions").forEach((details) => {
        const menu = details.querySelector(":scope > div");
        if (!menu) return;
        details.addEventListener("toggle", () => {
          if (!details.open) return;
          document.querySelectorAll(".actions[open]").forEach((other) => {
            if (other !== details) other.removeAttribute("open");
          });
        });
      });

      function openModal(name) {
        document.querySelector('dialog[data-modal="' + name + '"]').showModal();
      }

      const purchaseForm = document.querySelector("[data-purchase-form]");
      const purchaseRepeatMode = purchaseForm && purchaseForm.querySelector('[name="repeatMode"]');
      const purchaseRepeatModeLabel = purchaseRepeatMode && purchaseRepeatMode.closest("label");

      function setPurchaseFieldVisible(name, visible) {
        const field = purchaseForm.querySelector('[data-purchase-field="' + name + '"]');
        if (field) field.hidden = !visible;
      }

      function syncPurchaseFieldVisibility() {
        const mode = purchaseRepeatMode.value;
        setPurchaseFieldVisible("totalInstallments", mode === "installment");
        setPurchaseFieldVisible("installmentStart", mode === "installment");
        setPurchaseFieldVisible("installmentValueMode", mode === "installment");
        setPurchaseFieldVisible("interval", mode === "fixed");
        setPurchaseFieldVisible("frequency", mode === "fixed");
        setPurchaseFieldVisible("endOn", mode === "fixed");
      }

      purchaseRepeatMode && purchaseRepeatMode.addEventListener("change", syncPurchaseFieldVisibility);

      const purchaseTotalInstallmentsInput = purchaseForm && purchaseForm.querySelector('[name="totalInstallments"]');
      const purchaseInstallmentStartInput = purchaseForm && purchaseForm.querySelector('[name="installmentStart"]');
      purchaseTotalInstallmentsInput && purchaseTotalInstallmentsInput.addEventListener("input", () => {
        const total = Math.max(2, Number(purchaseTotalInstallmentsInput.value || 2));
        purchaseInstallmentStartInput.max = String(total);
        if (Number(purchaseInstallmentStartInput.value || 1) > total) purchaseInstallmentStartInput.value = String(total);
      });

      document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => {
        if (button.disabled) return;
        if (button.dataset.openModal === "purchase") {
          purchaseForm.reset();
          purchaseForm.dataset.method = "POST";
          if (purchaseRepeatModeLabel) purchaseRepeatModeLabel.hidden = false;
          syncPurchaseFieldVisibility();
          document.querySelector("[data-purchase-modal-title]").textContent = "Nova compra";
        }
        openModal(button.dataset.openModal);
      }));

      document.querySelectorAll("[data-purchase]").forEach((node) => {
        const purchase = JSON.parse(node.textContent);
        const button = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
        if (!button) return;
        button.addEventListener("click", () => {
          const form = purchaseForm;
          form.reset();
          form.dataset.path = "/api/transactions/" + purchase.id;
          form.dataset.method = "PATCH";
          form.amountMinor.value = minorToMoneyInput(purchase.amountMinor);
          form.occurredOn.value = purchase.occurredOn;
          form.description.value = purchase.description;
          if (form.categoryId) form.categoryId.value = purchase.categoryId || "";
          if (purchaseRepeatModeLabel) purchaseRepeatModeLabel.hidden = true;
          syncPurchaseFieldVisibility();
          document.querySelector("[data-purchase-modal-title]").textContent = "Editar compra";
          openModal("purchase");
        });
      });

      async function send(path, method, body) {
        return fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }

      async function message(response) {
        const body = await response.json().catch(() => ({}));
        return response.ok ? "Ação concluída. Atualizando..." : ((body.error && body.error.message) || "Não foi possível concluir a ação.");
      }

      function statusNodeFor(form) {
        let status = form.querySelector("[data-form-status]");
        if (!status) {
          status = document.createElement("p");
          status.className = "form-status muted full";
          status.setAttribute("data-form-status", "");
          status.setAttribute("aria-live", "polite");
          form.appendChild(status);
        }
        return status;
      }

      function extractPurchaseCardId(path) {
        const match = /\\/api\\/cards\\/([^/]+)\\/purchases/.exec(path || "");
        return match ? match[1] : "";
      }

      document.querySelectorAll("[data-purchase-form]").forEach((form) => {
        const status = statusNodeFor(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const path = form.dataset.path || form.getAttribute("data-path");
          const method = form.dataset.method || "POST";
          const mode = method === "POST" ? String(data.get("repeatMode") || "single") : "single";
          const purchaseCardId =
            String(data.get("purchaseCardId") || "") || extractPurchaseCardId(path);
          const categoryId = String(data.get("categoryId") || "");
          const basePayload = {
            amountMinor: moneyToMinor(data.get("amountMinor")),
            occurredOn: String(data.get("occurredOn")),
            description: String(data.get("description") || ""),
          };
          if (categoryId) basePayload.categoryId = categoryId;

          status.textContent = "Salvando...";
          let response;

          if (mode === "fixed") {
            const endOn = String(data.get("endOn") || "");
            response = await send("/api/recurrences", "POST", {
              frequency: String(data.get("frequency") || "monthly"),
              interval: Math.max(1, Number(data.get("interval") || 1)),
              startOn: basePayload.occurredOn,
              ...(endOn ? { endOn } : {}),
              amountMinor: basePayload.amountMinor,
              description: basePayload.description,
              cardId: purchaseCardId,
              ...(categoryId ? { categoryId } : {}),
            });
          } else if (mode === "installment") {
            const totalInstallments = Math.max(2, Number(data.get("totalInstallments") || 2));
            const installmentStart = Math.min(
              Math.max(1, Number(data.get("installmentStart") || 1)),
              totalInstallments,
            );
            const valueMode = String(data.get("installmentValueMode") || "per_installment");
            const purchaseAmountMinor =
              valueMode === "per_installment"
                ? basePayload.amountMinor * totalInstallments
                : basePayload.amountMinor;
            response = await send("/api/cards/" + purchaseCardId + "/purchases", "POST", {
              ...basePayload,
              amountMinor: purchaseAmountMinor,
              totalInstallments,
              installmentStart,
            });
          } else if (purchaseCardId && method === "POST") {
            response = await send("/api/cards/" + purchaseCardId + "/purchases", "POST", basePayload);
          } else {
            response = await send(path, method, basePayload);
          }

          status.className = response.ok ? "form-status success full" : "form-status error full";
          status.textContent = await message(response);
          if (response.ok) window.setTimeout(() => window.location.reload(), 450);
        });
      });

      document.querySelectorAll("dialog form:not([data-purchase-form]):not(.close-form)").forEach((form) => {
        const status = statusNodeFor(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;
          const data = new FormData(form);
          const payload = {};
          data.forEach((value, key) => {
            if (value === "") return;
            const field = form.querySelector('[name="' + key + '"]');
            payload[key] = field && field.dataset.money !== undefined ? moneyToMinor(value) : value;
          });
          status.textContent = "Salvando...";
          const response = await send(form.dataset.path, "POST", payload);
          status.className = response.ok ? "form-status success full" : "form-status error full";
          status.textContent = await message(response);
          if (response.ok) window.setTimeout(() => window.location.reload(), 450);
        });
      });

      document.querySelectorAll("[data-api-action]").forEach((button) => {
        const status = statusNodeFor(button.closest(".invoice-actions") || button.parentElement);
        button.addEventListener("click", async () => {
          const confirmation = button.dataset.apiConfirm;
          if (confirmation && !window.confirm(confirmation)) return;
          button.disabled = true;
          status.textContent = "Enviando...";
          const response = await send(button.dataset.apiPath, button.dataset.apiMethod || "POST", {});
          status.className = response.ok ? "form-status success full" : "form-status error full";
          status.textContent = await message(response);
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          button.disabled = false;
        });
      });

      applyPurchaseFilters();
    </script>
  `;
}

function renderDotsIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="19" r="1.9" fill="currentColor"/></svg>`;
}

function renderEditIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderPencilIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatMoneyInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
}

function formatDate(value: string): string {
  return formatDateOnly(value);
}

function formatMonthYear(dateOnly: string): string {
  const [year, month] = dateOnly.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatGenericStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  if (status === "blocked") return "Bloqueado";
  if (status === "open") return "Aberta";
  if (status === "closed") return "Fechada";
  if (status === "paid") return "Paga";
  if (status === "overdue") return "Vencida";
  if (status === "cancelled") return "Cancelada";
  if (status === "reconciled") return "Conciliada";
  if (status === "posted") return "Não conciliada";
  if (status === "planned") return "Planejada";
  return status;
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

function fallbackSummary(invoice: InvoiceRecord): InvoiceSummaryRecord {
  return {
    invoiceId: invoice.id,
    financialProfileId: "",
    cardId: invoice.cardId,
    cardName: "Cartão",
    status: invoice.status,
    periodStartOn: invoice.periodStartOn,
    closingOn: invoice.periodEndOn,
    dueOn: invoice.dueOn,
    previousBalanceMinor: 0,
    totalExpensesMinor: invoice.totalAmountMinor,
    totalPaidMinor: invoice.status === "paid" ? invoice.totalAmountMinor : 0,
    amountDueMinor:
      invoice.status === "paid" || invoice.status === "cancelled" ? 0 : invoice.totalAmountMinor,
    reconciledExpensesMinor: 0,
    unreconciledExpensesMinor: invoice.totalAmountMinor,
    purchasesCount: 0,
    cardTotals: [],
  };
}

interface AccountRecord {
  id: string;
  name: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

interface CardRecord {
  id: string;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  maskedIdentifier?: string;
  institutionKey?: string;
}

interface CardAdditionalLinkRecord {
  groupCardId: string;
  cardId: string;
  isPrimary: boolean;
}

interface InvoiceRecord {
  id: string;
  cardId: string;
  status: string;
  periodStartOn: string;
  periodEndOn: string;
  dueOn: string;
  totalAmountMinor: number;
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

interface CardPurchaseRecord {
  id: string;
  financialProfileId: string;
  cardId: string;
  invoiceId?: string;
  categoryId?: string;
  recurrenceId?: string;
  occurredOn: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
}

function css(): string {
  return `
    :root{--bg:#f8fafc;--surface:#fff;--text:#0f172a;--muted:#475569;--line:#cbd5e1;--primary:#0f3d4c;--soft:#e8f3f6;--cyan:#0891b2;--green:#166534;--green-bg:#dcfce7;--red:#dc2626;--red-bg:#fee2e2;--amber:#b45309;--amber-bg:#fef3c7}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}h1,h2,h3,p,dl,dd{margin:0}button,a,input,select,textarea{font:inherit}.app-shell{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}.sidebar{background:var(--primary);color:white;display:flex;flex-direction:column;gap:20px;padding:22px}.brand{align-items:center;color:white;display:inline-flex;font-size:1.2rem;font-weight:900;gap:10px;text-decoration:none}.brand img{border-radius:6px;display:block}nav{display:grid;gap:6px}nav a{border-radius:8px;color:rgba(255,255,255,.82);font-weight:800;padding:10px 12px;text-decoration:none}nav a[aria-current=page],nav a:hover{background:rgba(34,211,238,.18);color:white}.logout{margin-top:auto}.topbar{align-items:center;background:white;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;min-height:64px;padding:0 24px}main{display:grid;gap:20px;margin:0 auto;max-width:1440px;padding:24px;width:100%}.panel{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px}.cards-heading{align-items:end;display:flex;gap:16px;justify-content:space-between}.cards-heading>div{display:grid;gap:6px;max-width:760px}.eyebrow{color:var(--cyan);font-size:.78rem;font-weight:800;letter-spacing:0;text-transform:uppercase}.muted{color:var(--muted);line-height:1.5}.button-link,button{align-items:center;background:var(--primary);border:0;border-radius:8px;color:white;cursor:pointer;display:inline-flex;font-weight:800;justify-content:center;min-height:42px;padding:0 14px;text-decoration:none}button:disabled{opacity:.55}.secondary-button{background:var(--soft);border:1px solid #d4e6ec;color:var(--primary)}label{display:grid;gap:8px;font-weight:700}[hidden]{display:none}input,select,textarea{border:1px solid var(--line);border-radius:8px;min-height:42px;padding:0 10px;width:100%}textarea{padding:10px}.error{background:var(--red-bg);border:1px solid #fecaca;border-radius:8px;color:var(--red);padding:10px 12px}.success{background:var(--green-bg);border:1px solid #bbf7d0;border-radius:8px;color:var(--green);padding:10px 12px}.form-status{min-height:1.3em}.card-filter{background:var(--surface)}.filter-form{align-items:end;display:grid;gap:12px;grid-template-columns:minmax(14rem,1.2fr) minmax(13rem,1fr)}.account-field{align-items:end;display:grid;gap:8px;grid-template-columns:1fr auto;position:relative}.account-field>label:first-child{grid-column:1/-1}.ghost-link{align-items:center;background:var(--soft);border:1px solid #d4e6ec;border-radius:8px;color:var(--primary);display:inline-flex;height:42px;justify-content:center;width:42px}.account-select{position:relative}.account-select-trigger{align-items:center;background:white;border:1px solid var(--line);color:var(--text);display:flex;gap:10px;justify-content:flex-start;text-align:left;width:100%}.account-select-trigger:hover{background:var(--soft)}.account-select-icon{align-items:center;display:inline-flex;flex-shrink:0;height:24px;width:24px}.account-select-icon .brand-icon,.account-select-icon .brand-icon-wrap{display:block;height:24px;width:24px}.account-select-icon .brand-logo-img{background:#fff;border-radius:50%;object-fit:contain;padding:3px}.account-select-text{flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-select-chevron{color:var(--muted);flex-shrink:0}.account-select-menu{background:white;border:1px solid var(--line);border-radius:8px;box-shadow:0 18px 40px rgba(15,23,42,.16);left:0;list-style:none;margin:6px 0 0;max-height:280px;overflow-y:auto;padding:6px;position:absolute;right:0;top:100%;z-index:20}.account-select-menu li{align-items:center;border-radius:6px;cursor:pointer;display:flex;font-weight:700;gap:10px;padding:9px 10px}.account-select-menu li:hover,.account-select-menu li[aria-selected=true]{background:var(--soft)}.month-field{display:grid;gap:8px}.month-nav{align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:8px;display:grid;gap:6px;grid-template-columns:auto minmax(0,1fr) auto;padding:4px}.month-current{font-weight:800;text-align:center}.icon-btn{background:white;border:1px solid var(--line);border-radius:6px;color:var(--primary);font-size:1.1rem;font-weight:900;line-height:1;min-height:34px;min-width:34px;padding:0}.icon-btn:hover{background:var(--soft)}.cards-layout{align-items:start;display:grid;gap:14px;grid-template-columns:300px minmax(0,1fr)}.invoice-summary{display:grid;gap:18px;position:sticky;top:88px}.summary-block{border-top:1px solid var(--line);display:grid;gap:10px;padding-top:14px}.summary-block:first-child{border-top:0;padding-top:0}.summary-block h2{font-size:.95rem}.summary-list{display:grid;gap:6px}.summary-row{align-items:center;display:flex;font-size:.86rem;gap:10px;justify-content:space-between}.summary-row dt{color:var(--muted);font-weight:700}.summary-row dd{font-weight:800;text-align:right}.summary-row-strong dd{font-size:1.05rem}.invoice-actions{display:grid;gap:8px}.credit{color:var(--green)!important}.debit{color:var(--red)!important}.invoice-panel{display:grid;gap:14px;padding:0}.invoice-toolbar{align-items:center;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;padding:18px}.filter-controls{align-items:center;display:flex;flex-wrap:wrap;gap:8px}.filter-controls input[type=search]{min-width:220px;width:auto}.toggle-chip{background:var(--bg);border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:.82rem;font-weight:800;min-height:36px;padding:0 14px}.toggle-chip[aria-pressed=true]{background:var(--soft);border-color:#a5cbd6;color:var(--primary)}.purchase-list{display:grid;gap:0;padding:0 18px 18px}.purchase-group{border-top:1px solid var(--line)}.purchase-group:first-child{border-top:0}.purchase-group-summary{align-items:center;cursor:pointer;display:flex;gap:10px;list-style:none;padding:14px 0}.purchase-group-summary::-webkit-details-marker{display:none}.purchase-group-summary::before{color:var(--muted);content:"▸";transition:transform .15s ease}.purchase-group[open]>.purchase-group-summary::before{transform:rotate(90deg)}.purchase-group-name{font-weight:800}.purchase-group-summary .muted{flex:1}.purchase-group-rows{display:grid;gap:0;padding-bottom:6px}.purchase-group-rows .purchase-row:first-child{border-top:1px solid var(--line)}.purchase-row{align-items:center;border-top:1px solid var(--line);display:grid;gap:12px;grid-template-columns:6.5rem minmax(0,1fr) auto 8.5rem 3.5rem;padding:14px 0}.purchase-row:first-child{border-top:0}.purchase-row time{color:var(--muted);font-size:.9rem}.description{display:grid;gap:3px;min-width:0}.description span{color:var(--muted);font-size:.86rem}.chip{align-items:center;background:var(--soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);display:inline-flex;font-size:.78rem;font-weight:800;gap:6px;padding:6px 10px;white-space:nowrap}.chip-ok{background:var(--green-bg);border-color:#bbf7d0;color:var(--green)}.chip-posted{background:#e0f2fe;border-color:#bae6fd;color:#0369a1}.actions{position:relative}.actions summary{align-items:center;background:var(--soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);cursor:pointer;display:inline-flex;height:32px;justify-content:center;list-style:none;width:32px}.actions summary::-webkit-details-marker{display:none}.actions-menu{background:white;border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 40px rgba(15,23,42,.16);display:grid;gap:2px;padding:6px;position:absolute;right:0;top:38px;width:max-content;z-index:50}.actions-item{align-items:center;background:transparent;border:0;border-radius:6px;color:var(--text);display:flex;font-size:.86rem;font-weight:700;gap:10px;justify-content:flex-start;min-height:36px;padding:0 10px;text-align:left;white-space:nowrap}.actions-item:hover{background:var(--soft)}.empty-state{background:var(--bg);border:1px dashed var(--line);border-radius:8px;display:grid;gap:6px;margin:18px;padding:16px}dialog{border:0;border-radius:8px;box-shadow:0 24px 80px rgba(15,23,42,.28);max-width:min(680px,calc(100vw - 32px));padding:0;width:100%}dialog::backdrop{background:rgba(6,25,35,.54)}.modal-panel{display:grid;gap:18px;padding:22px}.close-form{display:flex;justify-content:flex-end}.modal-panel form:not(.close-form){display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}.full{grid-column:1/-1}.error-page{min-height:100vh;place-content:center}@media(max-width:1080px){.cards-layout{grid-template-columns:1fr}.invoice-summary{position:static}}@media(max-width:760px){.app-shell{grid-template-columns:1fr}.sidebar{gap:12px;padding:14px}.sidebar .logout,.topbar button{display:none}nav{display:flex;gap:8px;overflow-x:auto}nav a{background:rgba(255,255,255,.1);white-space:nowrap}main{padding:18px 16px 28px}.filter-form,.modal-panel form:not(.close-form){grid-template-columns:1fr}.cards-heading{align-items:stretch;display:grid}.purchase-row{align-items:start;grid-template-columns:1fr}}
    ${recurrencesSectionStyles()}
  `;
}
