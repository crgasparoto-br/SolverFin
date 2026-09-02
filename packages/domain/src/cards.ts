import {
  payInvoice as payInvoiceCore,
  registerCardPurchase as registerCardPurchaseCore,
  type CardPurchaseResult,
  type InvoicePaymentResult,
  type PayInvoiceInput,
  type RegisterCardPurchaseInput,
} from "./cards-core.js";

export * from "./cards-core.js";

export type CardCurrencyInvariantErrorCode =
  | "CARD_INVOICE_CURRENCY_MISMATCH"
  | "CARD_INVOICE_PAYMENT_ACCOUNT_CURRENCY_MISMATCH";

export class CardCurrencyInvariantError extends Error {
  readonly code: CardCurrencyInvariantErrorCode;
  readonly statusCode = 409;

  constructor(code: CardCurrencyInvariantErrorCode, message: string) {
    super(message);
    this.name = "CardCurrencyInvariantError";
    this.code = code;
  }
}

export function registerCardPurchase(input: RegisterCardPurchaseInput): CardPurchaseResult {
  const result = registerCardPurchaseCore(input);
  const purchaseCurrency = requireCurrency(result.transaction.currency);

  for (const invoice of [result.invoice, ...result.futureInvoices]) {
    if (requireCurrency(invoice.currency) !== purchaseCurrency) {
      throw new CardCurrencyInvariantError(
        "CARD_INVOICE_CURRENCY_MISMATCH",
        "Purchase currency must match the invoice currency.",
      );
    }
  }

  const paymentAccountCurrency = normalizeCurrency(input.paymentAccount?.currency);
  const forecastTransactions = result.forecastTransactions.filter(
    (transaction) =>
      paymentAccountCurrency !== undefined &&
      normalizeCurrency(transaction.currency) === paymentAccountCurrency,
  );

  return {
    ...result,
    forecastTransactions,
  };
}

export function payInvoice(input: PayInvoiceInput): InvoicePaymentResult {
  const result = payInvoiceCore(input);
  const accountCurrency = normalizeCurrency(input.paymentAccount?.currency);
  const invoiceCurrency = requireCurrency(result.invoice.currency);

  if (accountCurrency === undefined || accountCurrency !== invoiceCurrency) {
    throw new CardCurrencyInvariantError(
      "CARD_INVOICE_PAYMENT_ACCOUNT_CURRENCY_MISMATCH",
      "Payment account currency must match the invoice currency.",
    );
  }

  return result;
}

function requireCurrency(value: string | undefined): string {
  const normalized = normalizeCurrency(value);

  if (normalized === undefined) {
    throw new CardCurrencyInvariantError(
      "CARD_INVOICE_CURRENCY_MISMATCH",
      "Purchase and invoice currency must be a three-letter ISO code.",
    );
  }

  return normalized;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized ?? "") ? normalized : undefined;
}
