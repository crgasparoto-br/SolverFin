import assert from "node:assert/strict";

import { renderCardsPageV2 } from "./cards-page-v2.js";

const originalFetch = globalThis.fetch;

await cardsA3KeepsHierarchyCurrencyAndSettlementDistinct();
await cardsA3BlocksNewPurchasesUntilCardCurrencyIsConfigured();
await cardsA3RendersEmptyStateWithoutCardContext();

globalThis.fetch = originalFetch;

async function cardsA3KeepsHierarchyCurrencyAndSettlementDistinct(): Promise<void> {
  const calledPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    calledPaths.push(`${url.pathname}${url.search}`);

    if (url.pathname === "/api/credit-card-accounts") {
      return jsonResponse({
        creditCardAccounts: [
          {
            id: "card-usd",
            name: "Cartão Viagem",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            currency: "USD",
            maskedIdentifier: "final 4242",
            institutionKey: "itau",
          },
          {
            id: "card-reserve",
            name: "Cartão Reserva",
            status: "active",
            closingDay: 5,
            dueDay: 15,
            currency: "BRL",
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          {
            id: "invoice-aug",
            cardId: "card-usd",
            status: "open",
            periodStartOn: "2026-08-01",
            periodEndOn: "2026-08-20",
            dueOn: "2026-09-10",
            totalAmountMinor: 27550,
            currency: "USD",
          },
          {
            id: "invoice-jul",
            cardId: "card-usd",
            status: "paid",
            periodStartOn: "2026-07-01",
            periodEndOn: "2026-07-20",
            dueOn: "2026-08-10",
            totalAmountMinor: 11000,
            currency: "USD",
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          { id: "account-usd", name: "Conta Dólar", status: "active", currency: "USD" },
          { id: "account-brl", name: "Conta Real", status: "active", currency: "BRL" },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({
        categories: [
          { id: "category-food", name: "Alimentação", status: "active" },
          {
            id: "category-restaurants",
            name: "Bares e restaurantes",
            status: "active",
            parentCategoryId: "category-food",
          },
          {
            id: "category-zoo",
            name: "Zoológico",
            status: "active",
            parentCategoryId: "category-food",
          },
          {
            id: "category-academy",
            name: "Academia",
            status: "active",
            parentCategoryId: "category-food",
          },
          {
            id: "category-orphan",
            name: "Categoria órfã",
            status: "active",
            parentCategoryId: "missing-parent",
          },
        ],
      });
    }

    if (url.pathname === "/api/credit-card-accounts/card-usd/instruments") {
      return jsonResponse({
        instruments: [
          {
            id: "instrument-main",
            type: "physical",
            holder: "primary",
            status: "active",
            isDefault: true,
            maskedIdentifier: "final 4242",
            effectiveCreditLimitMinor: 100000,
          },
          {
            id: "instrument-virtual",
            type: "virtual",
            holder: "primary",
            status: "active",
            isDefault: false,
            maskedIdentifier: "final 9001",
            effectiveCreditLimitMinor: 50000,
          },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("cardId"), "card-usd");
      return jsonResponse({ recurrences: [] });
    }

    if (url.pathname === "/api/invoices/invoice-aug/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-aug",
          financialProfileId: "profile-1",
          cardId: "card-usd",
          cardName: "Cartão Viagem",
          cardMaskedIdentifier: "final 4242",
          status: "open",
          periodStartOn: "2026-08-01",
          closingOn: "2026-08-20",
          dueOn: "2026-09-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 27550,
          totalPaidMinor: 0,
          amountDueMinor: 27550,
          reconciledExpensesMinor: 21000,
          unreconciledExpensesMinor: 6550,
          purchasesCount: 3,
          cardTotals: [
            {
              cardId: "card-usd",
              cardName: "Cartão Viagem",
              maskedIdentifier: "final 4242",
              limitTotalMinor: 150000,
              limitUsedMinor: 27550,
              limitAvailableMinor: 122450,
              invoiceTotalMinor: 27550,
              invoiceAmountDueMinor: 27550,
            },
          ],
        },
      });
    }

    if (url.pathname === "/api/invoices/invoice-aug/purchases") {
      return jsonResponse({
        purchases: [
          {
            id: "purchase-hotel",
            financialProfileId: "profile-1",
            cardId: "card-usd",
            cardInstrumentId: "instrument-main",
            invoiceId: "invoice-aug",
            categoryId: "category-restaurants",
            occurredOn: "2026-08-18",
            plannedOn: "2026-08-18",
            description: "Hotel",
            amountMinor: 21000,
            currency: "USD",
            status: "reconciled",
          },
          {
            id: "purchase-taxi",
            financialProfileId: "profile-1",
            cardId: "card-usd",
            cardInstrumentId: "instrument-virtual",
            invoiceId: "invoice-aug",
            occurredOn: "2026-08-19",
            plannedOn: "2026-08-19",
            description: "Táxi aeroporto",
            amountMinor: 15000,
            currency: "USD",
            status: "posted",
          },
          {
            id: "purchase-coffee",
            financialProfileId: "profile-1",
            cardId: "card-usd",
            cardInstrumentId: "instrument-virtual",
            invoiceId: "invoice-aug",
            occurredOn: "2026-08-20",
            plannedOn: "2026-08-20",
            description: "Café",
            amountMinor: 1550,
            purchaseTotalAmountMinor: 1550,
            installmentSequenceNumber: 2,
            totalInstallments: 0,
            currency: "USD",
            status: "planned",
          },
        ],
      });
    }

    if (url.pathname === "/api/installments") {
      assert.equal(url.searchParams.get("invoiceId"), "invoice-aug");
      return jsonResponse({
        installments: [
          {
            id: "installment-taxi-2",
            sequenceNumber: 2,
            totalInstallments: 3,
            initialSequenceNumber: 1,
            status: "posted",
            dueOn: "2026-08-19",
            amountMinor: 5000,
            currency: "USD",
            invoice: { id: "invoice-aug" },
            transaction: {
              id: "purchase-taxi",
              cardId: "card-usd",
              cardInstrumentId: "instrument-virtual",
              invoiceId: "invoice-jul",
              categoryId: "category-restaurants",
              occurredOn: "2026-07-19",
              plannedOn: "2026-07-19",
              description: "Táxi aeroporto",
              amountMinor: 15000,
              currency: "USD",
              status: "posted",
            },
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderCardsPageV2(
    "session-token",
    new URL(
      "http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug&q=a&sort=amount_desc&reconciliation=all",
    ),
  );

  assert.match(html, /data-cards-archetype="A3"/);
  assert.match(html, /sf-detail-layout/);
  assert.match(html, /Cartão Viagem/);
  assert.match(html, /Fatura selecionada/);
  assert.match(html, /Itens da fatura/);
  assert.match(html, /name="cardId" data-card-select/);
  assert.match(html, /type="month" name="month"/);
  assert.match(html, /cards-invoice-current/);
  assert.match(html, /cards-invoice-period-status">Aberta/);
  assert.match(html, /cards-invoice-period-link cards-invoice-period-link-previous" href=/);
  assert.match(html, /Escolher outro mês/);
  assert.match(html, /invoiceId=invoice-jul/);
  assert.match(html, /data-currency="USD"/);
  assert.doesNotMatch(
    html,
    /<\/strong><small>USD<\/small><\/section>/,
    "invoice summary must not repeat the currency code outside the Money primitive",
  );
  assert.match(html, /Moeda padrão<\/dt><dd>USD/);
  assert.match(html, /Moeda da fatura<\/dt><dd>USD/);
  assert.match(html, /name="currency" value="USD"[^>]*readonly/);
  assert.match(html, /aria-describedby="cards-purchase-dialog-description"/);
  // #742: clone is a new single purchase and installment amount uses its own safe API.
  assert.match(html, /data-clone-purchase="purchase-taxi"/);
  assert.match(html, /data-edit-installment-amount="purchase-taxi"/);
  assert.match(html, /data-modal="installment-value"/);
  assert.match(html, /data-installment-scope="current"/);
  assert.match(html, /data-installment-scope="current_and_future"/);
  assert.ok(html.includes('"/installments/" + encodeURIComponent(installmentId) + "/amount"'));
  assert.match(html, /Clonar compra/);
  assert.match(html, /Parcelas e recorrências não serão copiadas/);
  assert.match(html, /data-purchase-field="recurrenceDateHint" hidden/);
  // #742: recurring purchase dates require an explicit scope decision before PATCH.
  assert.match(html, /data-modal="recurring-edit-scope"/);
  assert.match(html, /data-recurring-edit-scope="current_only"/);
  assert.match(html, /data-recurring-edit-scope="current_and_future"/);
  assert.ok(html.includes('if (method === "PATCH" && purchaseForm.dataset.recurrenceId)'));
  assert.ok(html.includes("pendingRecurringEdit = { path, payload }"));
  assert.ok(html.includes('pendingRecurringEdit.path + "/current-only"'));
  assert.ok(html.includes("editScope: scope"));
  assert.ok(html.includes("recurringScopeDialog.showModal()"));
  assert.ok(
    html.includes('if (scope !== "current_only" && scope !== "current_and_future") return;'),
  );
  assert.ok(
    html.includes(
      'status.textContent = result?.error?.message || "Não foi possível editar a compra recorrente."',
    ),
  );
  assert.ok(html.includes('recurringScopeDialog?.addEventListener("cancel"'));
  assert.ok(html.includes("pendingRecurringEdit = null"));
  assert.ok(html.includes("purchaseForm?.querySelector('[name=\"occurredOn\"]')?.focus()"));
  assert.ok(html.includes('setAttribute("data-editing", "true")'));
  assert.ok(html.includes('setField("recurrenceDateHint", Boolean(purchase.recurrenceId))'));
  assert.ok(html.includes("if (scheduleSection) scheduleSection.hidden = true;"));
  assert.ok(html.includes(".cards-installment-scope-actions [data-installment-scope]"));
  assert.ok(!html.includes("Valor, data e estrutura do parcelamento são somente leitura."));

  assert.match(html, /data-open-modal="invoice-attachments"/);
  assert.ok(html.includes("<span>Documentos</span>"));
  assert.match(html, /<dialog class="cards-dialog" data-modal="invoice-attachments"/);
  assert.match(html, /data-entity-kind="invoice" data-entity-id="invoice-aug"/);
  const firstInvoiceDialog = html.indexOf(
    '<dialog class="cards-dialog" data-modal="invoice-attachments"',
  );
  const invoicePanel = html.slice(html.indexOf('class="cards-detail-panel"'), firstInvoiceDialog);
  assert.doesNotMatch(invoicePanel, /data-attachment-workspace/);
  // #715: enforce the approved shell hierarchy and accessible purchase actions.
  assert.match(html, /class="[^"]*cards-a3-page cards-has-invoice[^"]*"/);
  assert.ok(
    html.includes('.app-shell:has([data-cards-archetype="A3"]) .sidebar{background:var(--surface)'),
  );
  assert.ok(
    html.includes(
      ".cards-purchase-actions>summary{height:44px;min-height:44px;min-width:44px;width:44px}",
    ),
  );
  // #715: restore a true information sidebar, while keeping invoice actions subordinate to the task.
  assert.match(
    html,
    /<details class="cards-master-details" open><summary>Dados do cartão<\/summary>/,
  );
  assert.match(html, /<details class="cards-instrument-nav" open>/);
  assert.match(html, /Moeda padrão<\/dt><dd>USD/);
  assert.match(html, /Fechamento contratual/);
  assert.doesNotMatch(html, /class="cards-summary-icon"/);
  assert.match(html, /class="cards-summary-metric"/);
  assert.match(html, /id="cards-master-title">Cartão<\/h2>/);
  assert.match(html, /cards-summary-copy/);
  assert.ok(html.includes(".cards-a3-page{max-width:var(--sf-layout-content-max-width);"));
  assert.ok(html.includes("padding:18px var(--sf-layout-gutter-desktop) 24px"));
  assert.ok(html.includes("padding:8px var(--sf-layout-gutter-mobile) 20px"));
  assert.doesNotMatch(html, /\.cards-a3-page\{[^}]*max-width:(?:1500|1560)px/);
  assert.match(html, /Instrumentos <span>2 ativos<\/span>/);
  // #715: instrument identity and its capitalized Limite must be distinct visual lines.
  const instrumentsHtml =
    html.split('<details class="cards-instrument-nav" open>')[1]?.split("</details>")[0] ?? "";
  assert.ok(
    instrumentsHtml.includes(
      '<span class="cards-instrument-copy"><span class="cards-instrument-name">Físico - Titular principal · final 4242</span><small class="cards-instrument-limit">Limite USD 1.000,00</small></span><strong>Padrão</strong>',
    ),
  );
  assert.ok(
    instrumentsHtml.includes(
      '<span class="cards-instrument-copy"><span class="cards-instrument-name">Virtual - Titular principal · final 9001</span><small class="cards-instrument-limit">Limite USD 500,00</small></span>',
    ),
  );
  assert.doesNotMatch(instrumentsHtml, / · limite /);
  assert.ok(html.includes(".cards-instrument-copy{display:grid;gap:2px;min-width:0}"));
  assert.ok(
    html.includes(
      ".cards-instrument-nav li .cards-instrument-limit{color:var(--muted);display:block;",
    ),
  );
  assert.ok(html.includes("overflow-wrap:anywhere;white-space:normal}"));
  assert.match(
    html,
    /\.cards-a3-page \.sf-detail-layout\{align-items:start;display:grid;gap:16px;grid-template-columns:minmax\(238px,258px\) minmax\(0,1fr\)/,
  );
  assert.match(html, /matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(html, /Acompanhe as faturas, limites e compras dos seus cartões/);
  assert.match(
    html,
    /<details class="cards-settlement-note"><summary>Sobre a liquidação<\/summary>/,
  );
  assert.match(html, /<details class="cards-limit-detail"><summary>Detalhes do limite<\/summary>/);
  // #715: keep the card master discoverable, but show the amount first on narrow screens.
  assert.ok(html.includes('grid-template-areas:"amount" "context" "secondary"'));
  assert.match(html, /\.cards-card-picker label\{clip-path:inset\(50%\)/);
  assert.match(html, /\.cards-invoice-heading-row\{align-items:center;display:flex/);
  const summaryStart = html.indexOf('class="cards-invoice-summary"');
  const purchaseHeadingStart = html.indexOf('class="cards-purchase-section-header"');
  const summaryHtml = html.slice(summaryStart, purchaseHeadingStart);
  assert.equal((summaryHtml.match(/class="cards-summary-metric"/g) ?? []).length, 4);
  assert.doesNotMatch(summaryHtml, /class="cards-summary-icon"/);
  assert.ok(
    html.includes(".cards-summary-metric{align-items:start;background:transparent;border:0;"),
  );
  assert.ok(html.includes(".cards-invoice-summary .sf-summary-grid{display:grid;gap:0;"));
  assert.ok(
    html.includes(".cards-card-identity{align-items:center;background:transparent;border:0;"),
  );
  assert.ok(html.includes(".cards-card-identity>div strong{display:none}"));
  assert.ok(html.includes(".cards-instrument-group{border:0;border-top:1px solid var(--line)"));
  const limitMetricStart = summaryHtml.indexOf("Limite disponível");
  const limitDetailsStart = summaryHtml.indexOf('class="cards-limit-detail"');
  assert.ok(limitMetricStart >= 0 && limitDetailsStart > limitMetricStart);
  assert.ok(limitDetailsStart < summaryHtml.indexOf("</section>", limitMetricStart));
  const invoiceHeaderStart = html.indexOf('class="cards-invoice-header"');
  const invoiceHeaderEnd = html.indexOf("</header>", invoiceHeaderStart);
  const invoiceHeader = html.slice(invoiceHeaderStart, invoiceHeaderEnd);
  // The monetary decision is independent of the status/metadata and secondary action group.
  const contextAt = invoiceHeader.indexOf('class="cards-invoice-title-block"');
  const primaryAt = invoiceHeader.indexOf('class="cards-invoice-primary"');
  const secondaryAt = invoiceHeader.indexOf('class="cards-invoice-secondary-actions"');
  const closeAt = invoiceHeader.indexOf('data-api-path="/api/invoices/invoice-aug/close"');
  const documentsAt = invoiceHeader.indexOf('data-open-modal="invoice-attachments"');
  const paymentAt = invoiceHeader.indexOf('data-open-modal="payment"');
  assert.ok(primaryAt >= 0 && contextAt > primaryAt && secondaryAt > contextAt);
  assert.ok(paymentAt > primaryAt && paymentAt < secondaryAt);
  assert.ok(invoiceHeader.indexOf("Valor a pagar") < contextAt);
  assert.ok(documentsAt > secondaryAt && closeAt > secondaryAt);
  assert.match(invoiceHeader, /role="group" aria-label="Outras ações da fatura"/);
  assert.match(invoiceHeader, /<dl class="cards-invoice-metadata"/);
  assert.match(invoiceHeader, /<dt>Fechamento<\/dt><dd><time datetime="2026-08-20">/);
  assert.match(invoiceHeader, /<dt>Vencimento<\/dt><dd><time datetime="2026-09-10">/);
  assert.match(invoiceHeader, /<dt>Moeda<\/dt><dd>USD<\/dd>/);
  assert.equal((invoiceHeader.match(/class="sf-button sf-button-primary"/g) ?? []).length, 1);
  assert.ok(!invoiceHeader.slice(secondaryAt).includes("sf-button-primary"));
  assert.ok(html.includes('grid-template-areas:"amount context" "secondary secondary"'));
  assert.ok(html.includes(".cards-invoice-heading-row{clip-path:inset(50%);height:1px"));
  assert.match(invoiceHeader, /<h2 id="cards-invoice-title">/);
  assert.ok(html.includes("grid-template-columns:minmax(0,1.2fr) minmax(255px,.8fr)"));
  assert.ok(
    html.includes(
      ".cards-invoice-secondary-actions{align-items:center;display:grid;gap:3px 6px;grid-template-columns:repeat(2,minmax(0,1fr))",
    ),
  );
  assert.ok(
    html.includes(
      ".cards-invoice-current>strong{font-size:.72rem;letter-spacing:-.03em;white-space:nowrap}",
    ),
  );
  assert.match(invoiceHeader, /<span class="cards-kicker">Situação da fatura<\/span>/);
  assert.ok(
    html.includes(
      ".cards-invoice-secondary-actions :is(.cards-invoice-documents,.cards-close-invoice){align-items:center;background:transparent",
    ),
  );
  assert.ok(
    invoiceHeader.indexOf('class="cards-settlement-note"') >
      invoiceHeader.indexOf('class="cards-invoice-secondary-actions"'),
  );
  const purchaseHeaderStart = html.indexOf('class="cards-purchase-section-header"');
  const purchaseFilterStart = html.indexOf('class="cards-reconciliation-filters"');
  const purchaseHeader = html.slice(purchaseHeaderStart, purchaseFilterStart);
  assert.ok(purchaseHeaderStart > invoiceHeaderEnd);
  assert.ok(purchaseHeader.includes("Itens da fatura</h3>"));
  assert.ok(
    purchaseHeader.indexOf('data-open-modal="purchase"') >
      purchaseHeader.indexOf("Itens da fatura</h3>"),
  );
  assert.equal((html.match(/<button[^>]*data-open-modal="purchase"[^>]*>/g) ?? []).length, 1);
  assert.ok(!invoiceHeader.includes('data-open-modal="purchase"'));
  assert.ok(html.includes(".cards-purchase-section-header{"));
  // #715: the close icon must contrast with the light modal surface.
  assert.match(
    html,
    /\.cards-dialog-close\{[^}]*color:var\(--text\);[^}]*-webkit-text-fill-color:currentColor/,
  );
  assert.match(
    html,
    /\.cards-purchase-filter-form input,\.cards-purchase-filter-form select\{min-height:44px/,
  );
  // #720: creation and editing share the Golden Screen purchase-form composition.
  const purchaseDialog = html.slice(
    html.indexOf('<dialog class="cards-dialog" data-modal="purchase"'),
    html.indexOf('<dialog class="cards-dialog" data-modal="payment"'),
  );
  for (const heading of ["Valores", "Dados da compra", "Classificação", "Repetição e parcelas"]) {
    assert.ok(purchaseDialog.includes("<legend>" + heading + "</legend>"));
  }
  // Purchase rows expose instrument as a semantic column after Compra.
  assert.ok(
    html.includes('role="columnheader">Compra</span><span role="columnheader">Instrumento'),
  );
  assert.equal((html.match(/class="cards-purchase-table-head"/g) ?? []).length, 1);
  assert.ok(html.includes('class="cards-shared-table-head"'));
  assert.ok(html.includes('name="groupBy"'));
  assert.ok(html.includes('<option value="day" selected>Dia</option>'));
  assert.ok(html.includes('<option value="instrument">Instrumento</option>'));

  assert.ok(html.includes('class="cards-invoice-period-row"'));
  assert.ok(html.includes('<details class="cards-month-picker"'));
  assert.ok(
    html.includes(
      ".cards-invoice-navigation{display:flex;align-items:center;justify-content:flex-start",
    ),
  );
  assert.ok(html.includes(".cards-invoice-navigation .cards-invoice-period-row{flex:0 1 480px"));
  assert.ok(
    html.includes(".cards-invoice-navigation .cards-month-picker{flex:0 0 auto;position:relative"),
  );
  assert.ok(html.includes(".cards-shared-table-head{position:sticky"));
  assert.ok(html.includes("--cards-purchase-columns:"));
  assert.ok(html.includes(".cards-purchase-filter-form .cards-search-field input{width:100%"));
  assert.ok(
    html.includes(".cards-purchase-filter-form .cards-purchase-day-filter{grid-column:2!important"),
  );
  assert.ok(
    html.includes(
      ".cards-purchase-groups .cards-purchase-row{grid-template-columns:var(--cards-purchase-columns)",
    ),
  );

  assert.match(html, /role="cell" data-label="Instrumento" class="cards-purchase-instrument"/);
  assert.ok(
    html.includes('.cards-layout .sf-money[data-currency="BRL"]>.sf-money-currency{display:none}'),
  );
  assert.ok(
    html.includes('.cards-purchase-row .cards-purchase-category[data-category-direction="in"]'),
  );
  assert.ok(html.includes("data-save-continue"));
  assert.ok(html.includes("Salvar e continuar"));
  assert.ok(html.includes("compra(s) registrada(s). Informe a próxima compra."));
  assert.ok(html.includes("dataset.savedDuringSession"));
  // Distinguish actual busy-state activation from a guard that is never set.
  assert.ok(html.includes('purchaseForm.dataset.submitting = "true"'));
  assert.ok(html.includes('if (purchaseForm.dataset.submitting === "true") return;'));
  assert.ok(html.includes("submitButtons.forEach((button) => { button.disabled = true; })"));
  assert.ok(html.includes('addEventListener("close"'));
  assert.ok(html.includes("[data-save-continue]{display:none}"));
  assert.ok(html.includes("data-reverse-purchase="));
  assert.ok(html.includes("data-reversal-edit-form"));
  assert.ok(html.includes('data-modal="reversal-edit"'));
  assert.ok(html.includes("reversal.transactionId"));
  assert.ok(html.includes('Estorno: " + purchase.description'));

  assert.ok(html.includes("data-delete-purchase="));
  // Assert actual rendered permissions, not implementation source code inside the page.
  assert.match(html, /data-delete-purchase="purchase-hotel" disabled/);
  assert.match(html, /data-delete-purchase="purchase-taxi" disabled/);
  assert.match(html, /data-delete-purchase="purchase-coffee">/);

  assert.ok(html.includes(">Excluir</span>"));

  assert.ok(html.includes(">Estorno</span>"));
  assert.ok(!html.includes('data-label="Limite"'));
  assert.ok(!html.includes('role="columnheader">Moeda'));
  assert.match(purchaseDialog, /class="cards-purchase-form-body"/);
  assert.match(purchaseDialog, /class="cards-purchase-dialog-actions"/);
  assert.ok(purchaseDialog.includes('type="button" data-close-modal>Cancelar</button>'));
  assert.match(purchaseDialog, /data-purchase-field="installmentAmountMinor" hidden/);
  assert.match(purchaseDialog, /name="currency"[^>]*readonly/);
  assert.ok(html.includes('data-purchase-section="schedule"]'));
  assert.ok(html.includes(".cards-purchase-dialog-panel{display:flex"));
  assert.ok(html.includes(".cards-purchase-form-body{display:grid;align-content:start;flex:1"));
  assert.ok(html.includes('@media(max-width:600px){.cards-dialog[data-modal="purchase"]'));
  assert.match(html, /aria-describedby="cards-payment-dialog-description"/);
  assert.match(
    html,
    /@media\(max-width:350px\)\{\.cards-invoice-period-row\{[^}]*grid-template-columns:44px minmax\(0,1fr\) 44px/,
  );
  assert.match(html, /\.cards-instrument-group\{[^}]*overflow:visible/);
  assert.match(html, /name="occurredOn" type="date" required data-default-local-today/);
  assert.match(html, /occurredOnField\.value = localToday\(\)/);
  assert.match(html, /Alimentação › Bares e restaurantes/);
  assert.match(html, /Alimentação › Zoológico/);
  assert.match(html, /Alimentação › Academia/);
  assert.match(html, /Categoria órfã/);
  assert.ok(
    html.indexOf('value="category-food"') < html.indexOf('value="category-restaurants"'),
    "parent category must be rendered before its child",
  );
  assert.ok(
    html.indexOf('value="category-restaurants"') < html.indexOf('value="category-zoo"') &&
      html.indexOf('value="category-zoo"') < html.indexOf('value="category-academy"'),
    "sibling categories must preserve the stable order received from the API",
  );
  assert.match(html, /Conta Dólar · USD/);
  assert.doesNotMatch(html, /Conta Real · BRL/);
  assert.match(html, /Liquidação não é uma nova compra/);
  assert.match(html, /Ele não cria outra compra nem duplica a despesa já reconhecida/);
  assert.match(html, /data-path="\/api\/invoices\/invoice-aug\/pay"/);
  assert.match(html, /Liquidar fatura/);
  assert.match(html, /Fechar fatura/);
  // #715: one invoice-level primary action; recording a purchase is contextual.
  assert.match(html, /class="sf-button sf-button-primary" data-open-modal="payment"/);
  assert.match(
    html,
    /class="sf-button sf-button-secondary cards-close-invoice" data-api-path="\/api\/invoices\/invoice-aug\/close"/,
  );
  assert.match(html, /class="sf-button sf-button-secondary" data-open-modal="purchase"/);
  assert.doesNotMatch(html, /class="sf-button sf-button-primary" data-open-modal="purchase"/);
  assert.match(html, /<span>Valor a pagar<\/span>\s*<strong>[\s\S]*?data-currency="USD"/);
  assert.match(html, /<dt>Vencimento<\/dt>[\s\S]*?<dt>Fechamento<\/dt>/);
  // Secondary filters are progressively disclosed, but selected non-default filters stay evident.
  assert.match(html, /<details class="cards-advanced-filters" open>/);
  assert.match(html, /Mais filtros · ativos/);
  assert.match(html, /name="sort"/);
  assert.match(html, /name="day"/);
  assert.equal((html.match(/name="day"/g) ?? []).length, 1);
  assert.match(html, /class="cards-purchase-day-filter"/);
  // Even with non-date sorting, the selected default grouping remains by day.
  assert.match(html, /data-cards-day-groups/);
  assert.match(html, /data-cards-day-group data-day="2026-08-19" open/);
  assert.match(html, /Dia da fatura/);
  // Fail-closed CSS guards for long descriptions, explicit currencies and compact mobile.
  assert.match(
    html,
    /\.cards-purchase-description strong\{[^}]*overflow-wrap:anywhere;white-space:normal/,
  );
  assert.doesNotMatch(html, /\.cards-purchase-description strong\{[^}]*text-overflow:ellipsis/);
  assert.match(html, /@media\(max-width:350px\)/);
  assert.match(html, /\.cards-dialog\{max-height:min\(90dvh/);
  assert.doesNotMatch(html, /\.cards-dialog\{overflow:hidden/);
  assert.doesNotMatch(html, /\.cards-dialog-panel\{[^}]*overflow-y:auto/);
  assert.match(html, /"purchaseTotalAmountMinor":15000/);
  assert.match(html, /Físico - Titular principal · final 4242/);
  assert.match(html, /Virtual - Titular principal · final 9001/);
  // Status icons and actions follow the Golden Screen; finite installments use a dedicated route.
  assert.match(html, /Situação: Conciliada\. Alterar situação/);
  assert.match(html, /Situação: Não conciliada\. Alterar situação/);
  assert.match(html, /Situação: Planejada\. Alterar situação/);
  assert.match(
    html,
    /class="cards-purchase-status-current" role="img" aria-label="Situação atual: Conciliada"/,
  );
  assert.match(html, /data-set-purchase-status="posted" data-status-purchase-id="purchase-hotel"/);
  assert.match(
    html,
    /data-set-purchase-status="reconciled" data-status-purchase-id="purchase-coffee"/,
  );
  assert.match(
    html,
    /data-status-installment-id="installment-taxi-2" data-status-invoice-id="invoice-aug"/,
  );
  assert.doesNotMatch(html, /cards-purchase-status-current">Atual:/);
  assert.match(html, /data-cards-status-feedback-message/);
  assert.match(html, /status: targetStatus/);
  assert.ok(html.includes("/installments/"));
  assert.ok(html.includes("/reconciliation"));
  assert.ok(html.includes(".cards-purchase-status-menu>button.cards-purchase-status-option{"));
  assert.ok(html.includes(".cards-purchase-status{height:26px;width:26px}"));
  assert.ok(html.includes(".cards-purchase-status svg{height:15px;width:15px}"));
  assert.match(
    html,
    /\.cards-purchase-status-control>summary:focus-visible\{outline:2px solid var\(--primary\)/,
  );
  assert.match(html, /class="cards-purchase-status-cell"/);
  assert.match(html, /title="Ações da compra"><svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html, /Ações da compra[^>]*>•••<\/summary>/);
  // #715: category is a real sixth column, not subordinate text inside the description.
  assert.match(
    html,
    /role="columnheader">Compra<\/span><span role="columnheader">Instrumento<\/span><span role="columnheader">Categoria<\/span><span role="columnheader">Situação/,
  );
  assert.match(
    html,
    /role="cell" data-label="Categoria" class="cards-purchase-category" data-category-direction="out">/,
  );
  assert.match(
    html,
    /data-label="Compra" class="cards-purchase-description description">[\s\S]*?<\/div>\s*<span role="cell" data-label="Instrumento" class="cards-purchase-instrument">[\s\S]*?<\/span>\s*<span role="cell" data-label="Categoria" class="cards-purchase-category" data-category-direction="out">/,
  );
  assert.match(html, /\.cards-purchase-category\{[^}]*overflow-wrap:anywhere/);
  // The same semantic fill palette as Extrato: entry green, expense red, transfer gray.
  for (const [direction, background, foreground] of [
    ["in", "--success-bg", "--success"],
    ["out", "--danger-bg", "--danger"],
    ["transfer", "--surface-soft", "--muted"],
  ]) {
    assert.ok(
      html.includes(
        `.cards-purchase-category[data-category-direction="${direction}"]>.cards-purchase-category-badge{background:var(${background});color:var(${foreground})}`,
      ),
    );
  }
  assert.match(
    html,
    /\.cards-purchase-category-badge\{[^}]*border-radius:8px[^}]*display:inline-grid/,
  );
  // Same visual grammar as Extrato: downward expense arrow and category name, not a plain cell.
  assert.match(
    html,
    /data-category-direction="out"><span class="cards-purchase-category-badge"><svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1\.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3\.5v12"\/><path d="m5\.5 11 4\.5 4\.5L14\.5 11"\/><\/svg><span class="cards-purchase-category-label">Bares e restaurantes<\/span><\/span><\/span>/,
  );
  assert.match(html, /\.cards-purchase-category-badge>svg\{[^}]*height:13px/);
  assert.match(
    html,
    /@media\(max-width:760px\)\{\.cards-purchase-row>\.cards-purchase-category\[data-label="Categoria"\]::before\{display:block;margin-bottom:4px\}/,
  );
  assert.match(
    html,
    /@media\(max-width:760px\)\{\.cards-purchase-row\{grid-template-columns:minmax\(0,1fr\) auto\}/,
  );
  assert.doesNotMatch(
    html,
    /<span>Sem categoria<\/span><\/div>\s*<span role="cell" data-label="Situação"/,
  );

  assert.match(html, /Hotel/);
  assert.match(html, /Táxi aeroporto/);
  // List rows are single-line: only a valid finite installment keeps n/total inline.
  const purchaseCells =
    html.match(
      /<div role="cell" data-label="Compra" class="cards-purchase-description description">[\s\S]*?<\/div>/g,
    ) ?? [];
  const taxiCell = purchaseCells.find((cell) => cell.includes("Táxi aeroporto")) ?? "";
  const coffeeCell = purchaseCells.find((cell) => cell.includes("Café")) ?? "";
  assert.match(
    taxiCell,
    /<strong>Táxi aeroporto <span class="installment-badge cards-installment-label" aria-label="Parcela 2 de 3" title="Parcela 2 de 3">Parcela 2 de 3<\/span><\/strong>/,
  );
  assert.doesNotMatch(taxiCell, /<small>|Total da compra:/);
  assert.equal((taxiCell.match(/installment-badge/g) ?? []).length, 1);
  assert.match(coffeeCell, /<strong>Café<\/strong>/);
  assert.doesNotMatch(coffeeCell, /2\/0|Parcela|<small>|Total da compra:/);
  assert.equal(purchaseCells.length, 3);
  assert.match(html, /data-purchase="purchase-taxi">[^<]*"purchaseTotalAmountMinor":15000/);
  assert.match(
    html,
    /name="installmentValueMode"><option value="total" selected>Valor total da compra<\/option><option value="per_installment">Valor da parcela/,
  );
  assert.match(html, /purchaseForm\.dataset\.installmentPurchase = isInstallmentPurchase/);
  assert.match(html, /CARD_INSTALLMENT_PURCHASE_STRUCTURE_LOCKED|editingInstallment/);
  assert.match(html, /Café/);
  assert.match(html, /data-reconciliation-toggle="reconciled"/);
  assert.match(html, /q=a&amp;sort=amount_desc&amp;reconciliation=reconciled/);
  assert.match(html, /data-reconciliation-toggle="unreconciled"/);
  assert.match(html, /data-purchase-search/);
  assert.match(html, /value="amount_desc" selected/);

  const recurrencesIndex = calledPaths.findIndex((path) => path.startsWith("/api/recurrences"));
  const purchasesIndex = calledPaths.indexOf("/api/invoices/invoice-aug/purchases");
  assert.ok(
    calledPaths.includes("/api/installments?invoiceId=invoice-aug&status=all"),
    "invoice render must load the canonical installment occurrence in one request",
  );
  assert.ok(
    recurrencesIndex >= 0 && purchasesIndex >= 0 && recurrencesIndex < purchasesIndex,
    "recurrences must be fetched before purchases so materialized purchases can appear in the same render",
  );
  const byDay = await renderCardsPageV2(
    "session-token",
    new URL("http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug&day=2026-08-19"),
  );
  assert.match(byDay, /value="2026-08-19"/);
  assert.match(byDay, /class="cards-clear-day" href="\/cartoes\?[^"]*cardId=card-usd/);
  assert.match(byDay, /data-cards-day-groups/);
  assert.match(byDay, /data-day="2026-08-19" open/);
  assert.doesNotMatch(byDay, /data-day="2026-08-18" open/);
  assert.doesNotMatch(byDay, /data-day="2026-08-20" open/);
  assert.match(
    byDay,
    /class="installment-badge cards-installment-label" aria-label="Parcela 2 de 3"/,
  );
  assert.match(byDay, /data-status-installment-id="installment-taxi-2"/);
  assert.equal((byDay.match(/data-cards-day-group data-day=/g) ?? []).length, 1);
  assert.doesNotMatch(byDay, /data-instrument-purchase-group/);
  assert.match(byDay, /class="cards-day-content">\s*<div class="cards-purchase-table"/);

  const sortedByAmount = await renderCardsPageV2(
    "session-token",
    new URL(
      "http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug&sort=amount_desc",
    ),
  );
  // Sorting must never switch the explicitly selected grouping.
  assert.match(sortedByAmount, /data-cards-day-groups/);
  assert.doesNotMatch(sortedByAmount, /data-instrument-purchase-group/);

  // Regression: an expense with an estorno-looking description remains a debit.
  // An actual INCOME reversal becomes a negative credit, independently of its text.
  const defaultFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const response = await defaultFetch(input);
    if (new URL(String(input)).pathname !== "/api/invoices/invoice-aug/purchases") {
      return response;
    }
    const body = await response.json();
    const hotel = body.purchases.find(
      (purchase: { id: string }) => purchase.id === "purchase-hotel",
    );
    assert.ok(hotel);
    hotel.kind = "expense";
    hotel.description = "Hotel [estorno:apenas-texto]";
    body.purchases.push({
      ...hotel,
      id: "purchase-credit",
      kind: "income",
      description: "Estorno: Hotel [estorno:purchase-hotel:unico]",
      amountMinor: 4_000,
      cardInstrumentId: "instrument-virtual",
    });
    body.purchases.push({
      ...hotel,
      id: "purchase-high",
      description: "Maior valor",
      amountMinor: 12_000,
      cardInstrumentId: "instrument-virtual",
    });
    body.purchases.push({
      ...hotel,
      id: "purchase-low",
      description: "Menor valor",
      amountMinor: 1_000,
      cardInstrumentId: "instrument-main",
    });
    return jsonResponse(body);
  };
  try {
    const daySorted = await renderCardsPageV2(
      "session-token",
      new URL(
        "http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug&sort=amount_desc&groupBy=day",
      ),
    );
    assert.match(daySorted, /data-cards-day-groups/);
    assert.doesNotMatch(daySorted, /data-instrument-purchase-group/);
    const purchaseRow = (page: string, name: string): string => {
      const position = page.indexOf("<strong>" + name + "</strong>");
      assert.ok(position > 0, "Missing purchase row: " + name);
      const beginning = page.lastIndexOf('<article class="cards-purchase-row"', position);
      const end = page.indexOf("</article>", position);
      assert.ok(beginning >= 0 && end > position, "Incomplete purchase row: " + name);
      return page.slice(beginning, end);
    };
    const debit = purchaseRow(daySorted, "Hotel [estorno:apenas-texto]");
    const credit = purchaseRow(daySorted, "Estorno: Hotel");
    assert.match(debit, /data-category-direction="out"/);
    assert.doesNotMatch(debit, /cards-purchase-amount is-negative/);
    assert.match(credit, /data-category-direction="in"/);
    assert.match(credit, /cards-purchase-amount is-negative/);
    const firstHigh = daySorted.indexOf("<strong>Maior valor</strong>");
    const firstLow = daySorted.indexOf("<strong>Menor valor</strong>");
    assert.ok(
      firstHigh > 0 && firstLow > firstHigh,
      "Day rows preserve amount descending across instruments",
    );

    const instrumentSorted = await renderCardsPageV2(
      "session-token",
      new URL(
        "http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug&sort=amount_desc&groupBy=instrument",
      ),
    );
    assert.doesNotMatch(instrumentSorted, /data-cards-day-groups/);
    assert.match(instrumentSorted, /data-instrument-purchase-group/);
    const highInInstrument = instrumentSorted.indexOf("<strong>Maior valor</strong>");
    const taxiInInstrument = instrumentSorted.indexOf("<strong>Táxi aeroporto");
    assert.ok(
      highInInstrument > 0 && taxiInInstrument > highInInstrument,
      "Instrument rows preserve amount descending rather than force date order",
    );
  } finally {
    globalThis.fetch = defaultFetch;
  }

  // #742: a locked invoice prevents editing the origin, not creating an independent clone.
  // Use a paid invoice rather than changing the source purchase into an editable fixture.
  const openInvoiceFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/invoices" || path === "/api/invoices/invoice-aug/summary") {
      const original = await openInvoiceFetch(input);
      const body = await original.json();
      if (path === "/api/invoices") {
        body.invoices = body.invoices.map((invoice: { id: string; status: string }) =>
          invoice.id === "invoice-aug" ? { ...invoice, status: "paid" } : invoice,
        );
      } else {
        body.summary.status = "paid";
      }
      return jsonResponse(body);
    }
    return openInvoiceFetch(input);
  };
  try {
    const paidInvoice = await renderCardsPageV2(
      "session-token",
      new URL("http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug"),
    );
    assert.match(paidInvoice, /data-edit-purchase="purchase-hotel" disabled/);
    assert.match(
      paidInvoice,
      /data-clone-purchase="purchase-hotel" data-clone-source-locked="true">/,
    );
    assert.match(
      paidInvoice,
      /cloneButton\.dataset\.cloneSourceLocked === "true" \? localToday\(\) : purchase\.occurredOn/,
    );
    assert.match(paidInvoice, /data-delete-purchase="purchase-hotel" disabled/);
  } finally {
    globalThis.fetch = openInvoiceFetch;
  }
}

async function cardsA3BlocksNewPurchasesUntilCardCurrencyIsConfigured(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname === "/api/credit-card-accounts") {
      return jsonResponse({
        creditCardAccounts: [
          {
            id: "card-without-currency",
            name: "Cartão legado",
            status: "active",
            closingDay: 8,
            dueDay: 15,
          },
        ],
      });
    }
    if (url.pathname === "/api/invoices") return jsonResponse({ invoices: [] });
    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    if (url.pathname === "/api/credit-card-accounts/card-without-currency/instruments") {
      return jsonResponse({
        instruments: [
          {
            id: "instrument-legacy",
            type: "physical",
            holder: "primary",
            status: "active",
            isDefault: true,
            effectiveCreditLimitMinor: 100000,
          },
        ],
      });
    }
    if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
    return jsonResponse({});
  };

  const html = await renderCardsPageV2(
    "session-token",
    new URL("http://solverfin.local/cartoes?cardId=card-without-currency"),
  );

  assert.match(html, /Moeda padrão<\/dt><dd>Não informada/);
  assert.match(html, /class="cards-instrument-limit">Limite com moeda indisponível<\/small>/);
  assert.match(html, /Defina a moeda padrão deste cartão antes de registrar novas compras/);
  assert.match(html, /resource=card%3Acard-without-currency/);
  assert.match(
    html,
    /data-open-modal="purchase" disabled title="Defina a moeda padrão do cartão em Contas e Cartões"/,
  );
  assert.match(html, /name="currency" value=""[^>]*readonly/);
  assert.match(html, /Defina a moeda padrão do cartão antes de registrar uma compra/);
  assert.match(html, /type="submit" disabled>Salvar compra/);
  assert.doesNotMatch(html, /name="currency" value="BRL"/);
}

async function cardsA3RendersEmptyStateWithoutCardContext(): Promise<void> {
  const calledPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    calledPaths.push(`${url.pathname}${url.search}`);

    if (url.pathname === "/api/credit-card-accounts") {
      return jsonResponse({ creditCardAccounts: [] });
    }
    if (url.pathname === "/api/invoices") return jsonResponse({ invoices: [] });
    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    return jsonResponse({});
  };

  const html = await renderCardsPageV2("session-token");

  assert.match(html, /Nenhum cartão cadastrado/);
  assert.match(html, /Cadastre um cartão para acompanhar faturas, limites e compras/);
  assert.match(html, /Selecione um cartão/);
  assert.match(html, /href="\/contas-cartoes"/);
  assert.equal(
    calledPaths.some(
      (path) => path.includes("/instruments") || path.startsWith("/api/recurrences"),
    ),
    false,
    "empty card state must not query card-scoped resources",
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
