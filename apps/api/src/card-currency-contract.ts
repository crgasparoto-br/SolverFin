import type { TenantContext } from "@solverfin/domain";

import { query } from "./db.js";
import { getAccountForContext } from "./repositories/accounts.js";

export type CardCurrencyContractErrorCode =
  | "CARD_CURRENCY_REQUIRED"
  | "CARD_CURRENCY_INVALID"
  | "CARD_CURRENCY_PAYMENT_ACCOUNT_MISMATCH"
  | "CARD_CURRENCY_LOCKED"
  | "CARD_PURCHASE_CURRENCY_MISMATCH";

export class CardCurrencyContractError extends Error {
  readonly code: CardCurrencyContractErrorCode;
  readonly statusCode: number;

  constructor(code: CardCurrencyContractErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "CardCurrencyContractError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeRequiredCardCurrency(value: unknown): string {
  if (typeof value !== "string") {
    throw new CardCurrencyContractError(
      "CARD_CURRENCY_REQUIRED",
      "Informe a moeda do cartão.",
      400,
    );
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new CardCurrencyContractError(
      "CARD_CURRENCY_INVALID",
      "Informe uma moeda válida com três letras, como BRL, USD ou EUR.",
      400,
    );
  }

  return normalized;
}

export function resolveCanonicalCardPurchaseCurrency(
  cardCurrency: string | undefined,
  clientCurrency: unknown,
): string {
  if (cardCurrency === undefined) {
    throw new CardCurrencyContractError(
      "CARD_CURRENCY_REQUIRED",
      "Defina a moeda do cartão em Contas e Cartões antes de registrar uma compra.",
      409,
    );
  }

  const canonicalCurrency = normalizeRequiredCardCurrency(cardCurrency);

  if (clientCurrency === undefined) {
    return canonicalCurrency;
  }

  const normalizedClientCurrency = normalizeRequiredCardCurrency(clientCurrency);

  if (normalizedClientCurrency !== canonicalCurrency) {
    throw new CardCurrencyContractError(
      "CARD_PURCHASE_CURRENCY_MISMATCH",
      "A moeda informada na compra deve ser igual à moeda padrão do cartão.",
      409,
    );
  }

  return canonicalCurrency;
}

export function assertLinkedPaymentAccountCurrency(
  cardCurrency: string,
  paymentAccountCurrency: string,
): void {
  const canonicalCurrency = normalizeRequiredCardCurrency(cardCurrency);
  const accountCurrency = normalizeRequiredCardCurrency(paymentAccountCurrency);

  if (accountCurrency !== canonicalCurrency) {
    throw new CardCurrencyContractError(
      "CARD_CURRENCY_PAYMENT_ACCOUNT_MISMATCH",
      "A conta de pagamento deve usar a mesma moeda do cartão.",
      409,
    );
  }
}

export function assertCardCurrencyChangeAllowed(
  currentCurrency: string | undefined,
  nextCurrency: string,
  hasFinancialHistory: boolean,
): void {
  if (currentCurrency === undefined) {
    return;
  }

  const current = normalizeRequiredCardCurrency(currentCurrency);
  const next = normalizeRequiredCardCurrency(nextCurrency);

  if (current !== next && hasFinancialHistory) {
    throw new CardCurrencyContractError(
      "CARD_CURRENCY_LOCKED",
      "A moeda do cartão não pode ser alterada depois do primeiro lançamento ou fatura.",
      409,
    );
  }
}

export async function assertLinkedPaymentAccountCurrencyForContext(
  context: TenantContext,
  paymentAccountId: string,
  cardCurrency: string,
): Promise<void> {
  const account = await getAccountForContext(context, paymentAccountId);
  assertLinkedPaymentAccountCurrency(cardCurrency, account.currency);
}

export async function assertCardCurrencyChangeAllowedForContext(
  context: TenantContext,
  cardId: string,
  currentCurrency: string | undefined,
  nextCurrency: string,
): Promise<void> {
  if (currentCurrency !== undefined) {
    const current = normalizeRequiredCardCurrency(currentCurrency);
    const next = normalizeRequiredCardCurrency(nextCurrency);

    if (current === next) {
      return;
    }
  }

  const rows = await query<{ hasFinancialHistory: boolean }>(
    `select (
       exists(
         select 1 from "Transaction"
         where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3
       ) or exists(
         select 1 from "Invoice"
         where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3
       )
     ) as "hasFinancialHistory"`,
    [context.organizationId, context.financialProfileId, cardId],
  );

  assertCardCurrencyChangeAllowed(
    currentCurrency,
    nextCurrency,
    rows[0]?.hasFinancialHistory ?? false,
  );
}
