import type {
  CashFlowProjection,
  CashFlowProjectionCurrencyBlock,
  CashFlowProjectionMovement,
} from "./cash-flow-projection.js";
import type { ISODate } from "./index.js";

export const FREE_TO_SPEND_HORIZON_DAYS = 30 as const;

export type FreeToSpendUnavailableReason = "projection-unavailable" | "projection-incomplete";

export interface FreeToSpendLimitingPoint {
  position: "opening" | "closing";
  date: ISODate;
  balanceMinor: number;
  movements: readonly CashFlowProjectionMovement[];
}

export interface AvailableFreeToSpendCurrencyBlock {
  currency: string;
  status: "available";
  minimumProjectedBalanceMinor: number;
  minimumBalanceOn: ISODate;
  freeToSpendMinor: number;
  projectedDeficitMinor: number;
  limitingPoint: FreeToSpendLimitingPoint;
}

export interface UnavailableFreeToSpendCurrencyBlock {
  currency: string;
  status: "unavailable";
  reason: FreeToSpendUnavailableReason;
}

export type FreeToSpendCurrencyBlock =
  | AvailableFreeToSpendCurrencyBlock
  | UnavailableFreeToSpendCurrencyBlock;

export interface CashFlowFreeToSpendSummary {
  referenceDate: ISODate;
  horizonDays: typeof FREE_TO_SPEND_HORIZON_DAYS;
  currencyBlocks: FreeToSpendCurrencyBlock[];
}

export type CashFlowProjectionWithFreeToSpend = CashFlowProjection & {
  freeToSpend: CashFlowFreeToSpendSummary;
};

export function attachFreeToSpendIndicator(
  projection: CashFlowProjection,
): CashFlowProjectionWithFreeToSpend {
  if (projection.horizonDays !== FREE_TO_SPEND_HORIZON_DAYS) {
    throw new Error("freeToSpend requer a projeção canônica de 30 dias.");
  }

  return {
    ...projection,
    freeToSpend: buildFreeToSpendSummary(projection),
  };
}

export function buildFreeToSpendSummary(
  projection: CashFlowProjection,
): CashFlowFreeToSpendSummary {
  if (projection.horizonDays !== FREE_TO_SPEND_HORIZON_DAYS) {
    throw new Error("freeToSpend requer a projeção canônica de 30 dias.");
  }

  const currencies = projection.currency
    ? [projection.currency.trim().toUpperCase()]
    : projection.currencyBlocks.map((block) => block.currency);

  return {
    referenceDate: projection.referenceDate,
    horizonDays: FREE_TO_SPEND_HORIZON_DAYS,
    currencyBlocks: [...new Set(currencies)]
      .sort((left, right) => left.localeCompare(right))
      .map((currency) => {
        const block = projection.currencyBlocks.find(
          (candidate) => candidate.currency === currency,
        );
        if (!block) {
          return {
            currency,
            status: "unavailable",
            reason: "projection-unavailable",
          };
        }
        return deriveCurrencyIndicator(projection.referenceDate, block);
      }),
  };
}

function deriveCurrencyIndicator(
  referenceDate: ISODate,
  block: CashFlowProjectionCurrencyBlock,
): FreeToSpendCurrencyBlock {
  if (!isCompleteThirtyDayBlock(referenceDate, block)) {
    return {
      currency: block.currency,
      status: "unavailable",
      reason: "projection-incomplete",
    };
  }

  let minimumProjectedBalanceMinor = block.openingBalanceMinor;
  let minimumBalanceOn = referenceDate;
  let limitingPoint: FreeToSpendLimitingPoint = {
    position: "opening",
    date: referenceDate,
    balanceMinor: block.openingBalanceMinor,
    movements: [],
  };

  for (const point of block.points) {
    if (point.closingBalanceMinor < minimumProjectedBalanceMinor) {
      minimumProjectedBalanceMinor = point.closingBalanceMinor;
      minimumBalanceOn = point.date;
      limitingPoint = {
        position: "closing",
        date: point.date,
        balanceMinor: point.closingBalanceMinor,
        movements: point.movements,
      };
    }
  }

  return {
    currency: block.currency,
    status: "available",
    minimumProjectedBalanceMinor,
    minimumBalanceOn,
    freeToSpendMinor: Math.max(0, minimumProjectedBalanceMinor),
    projectedDeficitMinor: Math.max(0, -minimumProjectedBalanceMinor),
    limitingPoint,
  };
}

function isCompleteThirtyDayBlock(
  referenceDate: ISODate,
  block: CashFlowProjectionCurrencyBlock,
): boolean {
  if (!Number.isSafeInteger(block.openingBalanceMinor) || block.points.length !== 30) {
    return false;
  }

  return block.points.every(
    (point, index) =>
      point.date === addDays(referenceDate, index + 1) &&
      Number.isSafeInteger(point.closingBalanceMinor),
  );
}

function addDays(value: ISODate, days: number): ISODate {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
