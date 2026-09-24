import type {
  FutureCommitment,
  FutureCommitmentEffectRole,
  FutureCommitmentSource,
} from "./future-commitments.js";
import type { ISODate } from "./index.js";
import { addSafeMoneyMinor, assertSafeMoneyMinor } from "./money.js";

export const CASH_FLOW_PROJECTION_HORIZONS = [30, 60, 90] as const;
export type CashFlowProjectionHorizonDays = (typeof CASH_FLOW_PROJECTION_HORIZONS)[number];

export type CashFlowProjectionErrorCode =
  | "CASH_FLOW_PROJECTION_REFERENCE_DATE_INVALID"
  | "CASH_FLOW_PROJECTION_HORIZON_INVALID"
  | "CASH_FLOW_PROJECTION_CURRENCY_INVALID";

export class CashFlowProjectionError extends Error {
  readonly code: CashFlowProjectionErrorCode;
  readonly statusCode: number;

  constructor(code: CashFlowProjectionErrorCode, message: string) {
    super(message);
    this.name = "CashFlowProjectionError";
    this.code = code;
    this.statusCode = 400;
  }
}

export interface CashFlowProjectionWindow {
  referenceDate: ISODate;
  horizonDays: CashFlowProjectionHorizonDays;
  from: ISODate;
  to: ISODate;
}

export interface CashFlowOpeningBalance {
  currency: string;
  amountMinor: number;
}

export interface CashFlowProjectionMovement {
  commitmentId: string;
  effectId: string;
  plannedOn: ISODate;
  description: string;
  source: FutureCommitmentSource;
  role: FutureCommitmentEffectRole;
  amountMinor: number;
  currency: string;
  accountId?: string;
  cardId?: string;
  categoryId?: string;
}

export interface CashFlowProjectionPoint {
  date: ISODate;
  netMovementMinor: number;
  closingBalanceMinor: number;
  movements: CashFlowProjectionMovement[];
}

export interface CashFlowProjectionCurrencyBlock {
  currency: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  points: CashFlowProjectionPoint[];
}

export interface CashFlowProjection {
  referenceDate: ISODate;
  horizonDays: CashFlowProjectionHorizonDays;
  from: ISODate;
  to: ISODate;
  currencyBlocks: CashFlowProjectionCurrencyBlock[];
  currency?: string;
}

export interface BuildCashFlowProjectionInput {
  window: CashFlowProjectionWindow;
  openingBalances: readonly CashFlowOpeningBalance[];
  commitments: readonly FutureCommitment[];
  currency?: string;
}

export function resolveCashFlowProjectionWindow(
  referenceDate: string,
  horizonDays: number,
): CashFlowProjectionWindow {
  const normalizedReferenceDate = validateDate(referenceDate);
  if (!isCashFlowProjectionHorizonDays(horizonDays)) {
    throw new CashFlowProjectionError(
      "CASH_FLOW_PROJECTION_HORIZON_INVALID",
      "Horizonte deve ser 30, 60 ou 90 dias.",
    );
  }

  return {
    referenceDate: normalizedReferenceDate,
    horizonDays,
    from: addDays(normalizedReferenceDate, 1),
    to: addDays(normalizedReferenceDate, horizonDays),
  };
}

export function buildCashFlowProjection(
  input: BuildCashFlowProjectionInput,
): CashFlowProjection {
  const requestedCurrency = normalizeOptionalCurrency(input.currency);
  const openingByCurrency = new Map<string, number>();
  const movementsByCurrencyAndDate = new Map<string, Map<ISODate, CashFlowProjectionMovement[]>>();
  const currencies = new Set<string>();

  for (const opening of input.openingBalances) {
    const currency = normalizeCurrency(opening.currency);
    if (requestedCurrency !== undefined && currency !== requestedCurrency) continue;
    const amountMinor = assertSafeMoneyMinor(
      opening.amountMinor,
      `cash flow opening balance for ${currency}`,
    );
    const current = openingByCurrency.get(currency) ?? 0;
    openingByCurrency.set(
      currency,
      addSafeMoneyMinor([current, amountMinor], `cash flow opening balance for ${currency}`),
    );
    currencies.add(currency);
  }

  for (const commitment of input.commitments) {
    if (commitment.plannedOn < input.window.from || commitment.plannedOn > input.window.to) continue;

    for (const effect of commitment.monetaryEffects) {
      const currency = normalizeCurrency(effect.currency);
      if (requestedCurrency !== undefined && currency !== requestedCurrency) continue;
      currencies.add(currency);

      const byDate = movementsByCurrencyAndDate.get(currency) ?? new Map();
      const movements = byDate.get(commitment.plannedOn) ?? [];
      movements.push({
        commitmentId: commitment.id,
        effectId: effect.id,
        plannedOn: commitment.plannedOn,
        description: commitment.description,
        source: commitment.source,
        role: effect.role,
        amountMinor: assertSafeMoneyMinor(effect.amountMinor, `cash flow effect ${effect.id}`),
        currency,
        ...(effect.accountId ? { accountId: effect.accountId } : {}),
        ...(effect.cardId ? { cardId: effect.cardId } : {}),
        ...(commitment.categoryId ? { categoryId: commitment.categoryId } : {}),
      });
      byDate.set(commitment.plannedOn, movements);
      movementsByCurrencyAndDate.set(currency, byDate);
    }
  }

  if (requestedCurrency !== undefined) currencies.add(requestedCurrency);

  const currencyBlocks = [...currencies]
    .sort((left, right) => left.localeCompare(right))
    .map((currency) =>
      buildCurrencyBlock(
        currency,
        openingByCurrency.get(currency) ?? 0,
        movementsByCurrencyAndDate.get(currency),
        input.window,
      ),
    );

  return {
    referenceDate: input.window.referenceDate,
    horizonDays: input.window.horizonDays,
    from: input.window.from,
    to: input.window.to,
    currencyBlocks,
    ...(requestedCurrency ? { currency: requestedCurrency } : {}),
  };
}

function buildCurrencyBlock(
  currency: string,
  openingBalanceMinor: number,
  movementsByDate: ReadonlyMap<ISODate, CashFlowProjectionMovement[]> | undefined,
  window: CashFlowProjectionWindow,
): CashFlowProjectionCurrencyBlock {
  let closingBalanceMinor = openingBalanceMinor;
  const points: CashFlowProjectionPoint[] = [];

  for (let offset = 1; offset <= window.horizonDays; offset += 1) {
    const date = addDays(window.referenceDate, offset);
    const movements = [...(movementsByDate?.get(date) ?? [])].sort(compareMovements);
    const netMovementMinor = addSafeMoneyMinor(
      movements.map((movement) => movement.amountMinor),
      `cash flow daily movement for ${currency} on ${date}`,
    );
    closingBalanceMinor = addSafeMoneyMinor(
      [closingBalanceMinor, netMovementMinor],
      `cash flow closing balance for ${currency} on ${date}`,
    );
    points.push({ date, netMovementMinor, closingBalanceMinor, movements });
  }

  return { currency, openingBalanceMinor, closingBalanceMinor, points };
}

function compareMovements(left: CashFlowProjectionMovement, right: CashFlowProjectionMovement): number {
  const byCommitment = left.commitmentId.localeCompare(right.commitmentId);
  return byCommitment === 0 ? left.effectId.localeCompare(right.effectId) : byCommitment;
}

function isCashFlowProjectionHorizonDays(value: number): value is CashFlowProjectionHorizonDays {
  return CASH_FLOW_PROJECTION_HORIZONS.some((candidate) => candidate === value);
}

function normalizeOptionalCurrency(currency: string | undefined): string | undefined {
  if (currency === undefined || currency.trim() === "") return undefined;
  return normalizeCurrency(currency);
}

function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new CashFlowProjectionError(
      "CASH_FLOW_PROJECTION_CURRENCY_INVALID",
      "Moeda deve usar codigo ISO de tres letras.",
    );
  }
  return normalized;
}

function validateDate(value: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CashFlowProjectionError(
      "CASH_FLOW_PROJECTION_REFERENCE_DATE_INVALID",
      "Data de referencia deve usar YYYY-MM-DD.",
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CashFlowProjectionError(
      "CASH_FLOW_PROJECTION_REFERENCE_DATE_INVALID",
      "Data de referencia invalida.",
    );
  }
  return value;
}

function addDays(value: ISODate, days: number): ISODate {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  const result = parsed.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new CashFlowProjectionError(
      "CASH_FLOW_PROJECTION_REFERENCE_DATE_INVALID",
      "Horizonte ultrapassa o intervalo de datas suportado.",
    );
  }
  return result;
}
