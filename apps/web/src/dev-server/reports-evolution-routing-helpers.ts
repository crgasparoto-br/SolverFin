export type ReportInterval = "monthly" | "annual" | "rolling-year";

export interface EvolutionFilters {
  interval: ReportInterval;
  start: string;
  periods: number;
  profileId?: string;
  accountId?: string;
  cardId?: string;
  currency?: string;
}

export function isEvolutionStartValid(interval: ReportInterval, start: string): boolean {
  if (interval === "annual") return /^\d{4}$/.test(start) && Number(start) >= 1;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(start) && Number(start.slice(0, 4)) >= 1;
}

export function validateEvolutionStart(interval: ReportInterval, start: string): void {
  if (isEvolutionStartValid(interval, start)) return;
  if (interval === "annual") {
    throw new Error("Início inválido. Informe um ano no formato AAAA.");
  }
  throw new Error("Início inválido. Informe um mês no formato AAAA-MM.");
}

export function isEvolutionEndRepresentable(
  interval: ReportInterval,
  start: string,
  periods: number,
): boolean {
  if (!isEvolutionStartValid(interval, start)) return false;
  if (interval === "annual") return Number(start) + periods - 1 <= 9999;
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  const offset = interval === "monthly" ? periods - 1 : periods * 12 - 1;
  return addMonths(year, month, offset).year <= 9999;
}

export function validateEvolutionEnd(
  interval: ReportInterval,
  start: string,
  periods: number,
): void {
  if (!isEvolutionEndRepresentable(interval, start, periods)) {
    throw new Error("O período calculado ultrapassa o ano 9999.");
  }
}

export function deriveEvolutionStart(
  interval: ReportInterval,
  periods: number,
  referenceDate: Date,
): string {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  if (interval === "annual") return String(year - periods + 1).padStart(4, "0");
  const offset = interval === "monthly" ? -(periods - 1) : -(periods * 12 - 1);
  const result = addMonths(year, month, offset);
  return `${String(result.year).padStart(4, "0")}-${String(result.month).padStart(2, "0")}`;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const absolute = year * 12 + month - 1 + offset;
  return { year: Math.floor(absolute / 12), month: (((absolute % 12) + 12) % 12) + 1 };
}

export function buildAccountsApiPath(profileId: string | undefined): string {
  const params = new URLSearchParams({ status: "active" });
  if (profileId) params.set("profileId", profileId);
  return `/api/accounts?${params.toString()}`;
}

export function buildCreditCardAccountsApiPath(profileId: string | undefined): string {
  const params = new URLSearchParams({ status: "all" });
  if (profileId) params.set("profileId", profileId);
  return `/api/credit-card-accounts?${params.toString()}`;
}

export function buildEvolutionApiPath(filters: EvolutionFilters): string {
  return `/api/reports/category-evolution?${new URLSearchParams({
    interval: filters.interval,
    start: filters.start,
    periods: String(filters.periods),
    ...(filters.profileId ? { profileId: filters.profileId } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.cardId ? { cardId: filters.cardId } : {}),
  }).toString()}`;
}

export function isInterval(value: string | null): value is ReportInterval {
  return value === "monthly" || value === "annual" || value === "rolling-year";
}

export function nonEmpty(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

export function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
