import { formatMinorCurrency } from "@solverfin/shared";

import { renderText } from "./primitives.js";

export type MoneyDisplayContext = "native" | "converted";

export interface MoneyProps {
  amountMinor: number | null;
  currency: string;
  context?: MoneyDisplayContext;
  unavailableLabel?: string;
  /** Omit the trailing ISO code only when the surrounding UI already identifies the currency. */
  showCurrencyCode?: boolean;
}

const DEFAULT_UNAVAILABLE_LABEL = "Indisponível";

/**
 * Formats one monetary value for SolverFin UI surfaces.
 *
 * Money deliberately requires the currency at its boundary even though the shared
 * formatter still exposes a legacy BRL fallback. `null` is the explicit unavailable
 * state; missing values are rejected instead of being coerced to zero.
 */
export function renderMoney(props: MoneyProps): string {
  const currency = requireExplicitCurrency(props.currency);
  const context = props.context ?? "native";

  if (props.amountMinor === undefined) {
    throw new TypeError("Money requires amountMinor; use null for an unavailable value.");
  }

  const codeLabel =
    props.showCurrencyCode === false
      ? ""
      : ` <small class="sf-money-currency" aria-label="Moeda ${renderText(currency)}">${renderText(currency)}</small>`;

  const contextLabel =
    context === "converted"
      ? ' <small class="sf-money-context" aria-label="Valor convertido">Convertido</small>'
      : "";

  if (props.amountMinor === null) {
    const label = props.unavailableLabel?.trim() || DEFAULT_UNAVAILABLE_LABEL;
    return `<span class="sf-money sf-money-unavailable" data-currency="${renderText(currency)}" data-money-context="${context}" data-money-availability="unavailable"><span class="sf-money-value">${renderText(label)}</span>${codeLabel}${contextLabel}</span>`;
  }

  const formatted = formatMinorCurrency(props.amountMinor, { currency });
  return `<span class="sf-money" data-currency="${renderText(currency)}" data-money-context="${context}" data-money-availability="available"><span class="sf-money-value">${renderText(formatted)}</span>${codeLabel}${contextLabel}</span>`;
}

function requireExplicitCurrency(currency: string): string {
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim())) {
    throw new TypeError("Money requires an explicit three-letter currency code.");
  }

  return currency.trim().toUpperCase();
}
