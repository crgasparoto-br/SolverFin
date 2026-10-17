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
  assert.match(html, /Total da compra:[\s\S]*?data-currency="USD"/);
  assert.match(html, /Físico - Titular principal · final 4242/);
  assert.match(html, /Virtual - Titular principal · final 9001/);
  // Golden Screen: status cells are pictograms, not repeated text badges.
  assert.match(
    html,
    /class="cards-purchase-status cards-purchase-status-reconciled" role="img" tabindex="0" aria-label="Conciliada" title="Conciliada" data-tooltip="Conciliada"><svg/,
  );
  assert.match(
    html,
    /class="cards-purchase-status cards-purchase-status-posted" role="img" tabindex="0" aria-label="Não conciliada" title="Não conciliada" data-tooltip="Não conciliada"><svg/,
  );
  assert.match(
    html,
    /class="cards-purchase-status cards-purchase-status-planned" role="img" tabindex="0" aria-label="Planejada" title="Planejada" data-tooltip="Planejada"><svg/,
  );
  assert.doesNotMatch(html, /data-label="Situação">\s*<span class="sf-badge/);
  assert.match(html, /class="cards-purchase-status-cell"/);
  assert.match(html, /title="Ações da compra"><svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html, /Ações da compra[^>]*>•••<\/summary>/);
  // #715: category is a real sixth column, not subordinate text inside the description.
  assert.match(
    html,
    /role="columnheader">Compra<\/span><span role="columnheader">Categoria<\/span><span role="columnheader">Situação/,
  );
  assert.match(html, /role="cell" data-label="Categoria" class="cards-purchase-category">/);
  assert.match(
    html,
    /data-label="Compra" class="cards-purchase-description description">[\s\S]*?<\/div>\s*<span role="cell" data-label="Categoria" class="cards-purchase-category">/,
  );
  assert.match(html, /\.cards-purchase-category\{[^}]*overflow-wrap:anywhere/);
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
  assert.match(html, /Parcela 2 de 3/);
  assert.match(html, /Total da compra:[\s\S]*USD[\s\S]*150,00/);
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
