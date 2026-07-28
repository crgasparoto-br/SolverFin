import type { TenantContext } from "@solverfin/domain";

import { query } from "./db.js";

export type CategoryEvolutionInterval = "monthly" | "annual" | "rolling-year";

export interface CategoryEvolutionFilters {
  interval: CategoryEvolutionInterval;
  start: string;
  periodCount: number;
  periods: readonly CategoryEvolutionPeriod[];
}

export interface CategoryEvolutionPeriod {
  key: string;
  label: string;
  accessibleLabel: string;
  startsOn: string;
  endsOn: string;
}

export interface CategoryEvolutionCell {
  amountMinor: number;
  percentage: number | null;
}

export interface CategoryEvolutionSeries {
  cells: readonly CategoryEvolutionCell[];
  totalMinor: number;
  totalPercentage: number | null;
  averageMinor: number;
  averagePercentage: number | null;
}

export interface CategoryEvolutionCategoryNode {
  categoryId: string | null;
  name: string;
  status: string;
  series: CategoryEvolutionSeries;
  children: readonly CategoryEvolutionCategoryNode[];
}

export interface CategoryEvolutionCurrencyBlock {
  currency: string;
  income: CategoryEvolutionSeries;
  incomeCategories: readonly CategoryEvolutionCategoryNode[];
  expense: CategoryEvolutionSeries;
  expenseCategories: readonly CategoryEvolutionCategoryNode[];
  result: CategoryEvolutionSeries;
}

export interface CategoryEvolutionReport {
  interval: CategoryEvolutionInterval;
  start: string;
  periodCount: number;
  periods: readonly CategoryEvolutionPeriod[];
  currencyBlocks: readonly CategoryEvolutionCurrencyBlock[];
}

interface CategoryRow {
  id: string;
  parentCategoryId: string | null;
  name: string;
  kind: string;
  status: string;
}

interface AggregatedMovementRow {
  periodIndex: number;
  kind: "income" | "expense";
  currency: string;
  categoryId: string | null;
  amountMinor: string | number;
}

export interface CategoryEvolutionSourceData {
  categories: readonly CategoryRow[];
  movements: readonly AggregatedMovementRow[];
}

interface MutableCategoryNode {
  categoryId: string | null;
  name: string;
  status: string;
  direct: number[];
  children: MutableCategoryNode[];
}

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

const MONTH_ACCESSIBLE_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const LIMITS: Record<CategoryEvolutionInterval, { defaultPeriods: number; maxPeriods: number }> = {
  monthly: { defaultPeriods: 12, maxPeriods: 24 },
  annual: { defaultPeriods: 3, maxPeriods: 10 },
  "rolling-year": { defaultPeriods: 3, maxPeriods: 10 },
};

export class CategoryEvolutionFilterError extends Error {
  readonly code = "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID";
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "CategoryEvolutionFilterError";
  }
}

export function parseCategoryEvolutionFilters(
  searchParams: URLSearchParams,
  referenceDate: Date = new Date(),
): CategoryEvolutionFilters {
  const rawInterval = searchParams.get("interval");
  const interval = rawInterval === null ? "monthly" : parseInterval(rawInterval);
  const limits = LIMITS[interval];
  const rawPeriods = searchParams.get("periods");
  const periodCount =
    rawPeriods === null
      ? limits.defaultPeriods
      : parsePeriodCount(rawPeriods, limits.maxPeriods, interval);
  const rawStart = searchParams.get("start");
  const start =
    rawStart === null
      ? deriveDefaultStart(interval, periodCount, referenceDate)
      : validateStart(interval, rawStart);
  const periods = buildPeriods(interval, start, periodCount);

  return { interval, start, periodCount, periods };
}

export async function buildCategoryEvolutionReportForContext(
  context: TenantContext,
  filters: CategoryEvolutionFilters,
): Promise<CategoryEvolutionReport> {
  const [categories, movements] = await Promise.all([
    query<CategoryRow>(
      `select "id", "parentCategoryId", "name",
              lower("kind"::text) as "kind",
              lower("status"::text) as "status"
         from "Category"
        where "organizationId" = $1
          and "financialProfileId" = $2`,
      [context.organizationId, context.financialProfileId],
    ),
    query<AggregatedMovementRow>(
      `with report_periods as (
         select (period.ordinality - 1)::integer as "periodIndex",
                period."startsOn"::date as "startsOn",
                period."endsOn"::date as "endsOn"
           from unnest($3::date[], $4::date[]) with ordinality
                as period("startsOn", "endsOn", ordinality)
       )
       select report_periods."periodIndex",
              lower(movement."kind"::text) as "kind",
              movement."currency",
              movement."categoryId",
              sum(movement."amountMinor")::bigint as "amountMinor"
         from report_periods
         join "Transaction" movement
           on movement."occurredOn" >= report_periods."startsOn"
          and movement."occurredOn" <= report_periods."endsOn"
        where movement."organizationId" = $1
          and movement."financialProfileId" = $2
          and movement."kind" in ('INCOME', 'EXPENSE')
          and movement."status" in ('POSTED', 'RECONCILED')
        group by report_periods."periodIndex",
                 movement."kind",
                 movement."currency",
                 movement."categoryId"
        order by movement."currency",
                 movement."kind",
                 report_periods."periodIndex",
                 movement."categoryId" nulls first`,
      [
        context.organizationId,
        context.financialProfileId,
        filters.periods.map((period) => period.startsOn),
        filters.periods.map((period) => period.endsOn),
      ],
    ),
  ]);

  return buildCategoryEvolutionReport(filters, { categories, movements });
}

export function buildCategoryEvolutionReport(
  filters: CategoryEvolutionFilters,
  source: CategoryEvolutionSourceData,
): CategoryEvolutionReport {
  const currencies = Array.from(
    new Set(source.movements.map((movement) => movement.currency)),
  ).sort();

  return {
    interval: filters.interval,
    start: filters.start,
    periodCount: filters.periodCount,
    periods: filters.periods,
    currencyBlocks: currencies.map((currency) =>
      buildCurrencyBlock(currency, filters.periodCount, source.categories, source.movements),
    ),
  };
}

function buildCurrencyBlock(
  currency: string,
  periodCount: number,
  categories: readonly CategoryRow[],
  movements: readonly AggregatedMovementRow[],
): CategoryEvolutionCurrencyBlock {
  const currencyMovements = movements.filter((movement) => movement.currency === currency);
  const incomeAmounts = sumSection(currencyMovements, "income", periodCount);
  const expenseAmounts = sumSection(currencyMovements, "expense", periodCount);
  const resultAmounts = incomeAmounts.map((income, index) => income - (expenseAmounts[index] ?? 0));

  return {
    currency,
    income: buildSeries(incomeAmounts, undefined),
    incomeCategories: buildCategoryTree(
      "income",
      periodCount,
      categories,
      currencyMovements,
      incomeAmounts,
    ),
    expense: buildSeries(expenseAmounts, incomeAmounts),
    expenseCategories: buildCategoryTree(
      "expense",
      periodCount,
      categories,
      currencyMovements,
      expenseAmounts,
    ),
    result: buildSeries(resultAmounts, incomeAmounts),
  };
}

function buildCategoryTree(
  kind: "income" | "expense",
  periodCount: number,
  categories: readonly CategoryRow[],
  movements: readonly AggregatedMovementRow[],
  sectionDenominators: readonly number[],
): CategoryEvolutionCategoryNode[] {
  const categoryById = new Map(
    categories
      .filter((category) => category.kind === kind)
      .map((category) => [category.id, category]),
  );
  const directByCategory = new Map<string | null, number[]>();

  for (const movement of movements) {
    if (movement.kind !== kind) continue;
    const categoryId =
      movement.categoryId && categoryById.has(movement.categoryId) ? movement.categoryId : null;
    const direct = directByCategory.get(categoryId) ?? zeroSeries(periodCount);
    direct[movement.periodIndex] =
      (direct[movement.periodIndex] ?? 0) + toSafeMinor(movement.amountMinor);
    directByCategory.set(categoryId, direct);
  }

  const neededIds = new Set<string>();
  for (const categoryId of directByCategory.keys()) {
    let currentId = categoryId;
    const chain = new Set<string>();
    while (currentId) {
      if (chain.has(currentId)) break;
      chain.add(currentId);
      const category = categoryById.get(currentId);
      if (!category) break;
      neededIds.add(currentId);
      currentId = category.parentCategoryId;
    }
  }

  const nodes = new Map<string, MutableCategoryNode>();
  for (const id of neededIds) {
    const category = categoryById.get(id);
    if (!category) continue;
    nodes.set(id, {
      categoryId: id,
      name: category.name,
      status: category.status,
      direct: directByCategory.get(id) ?? zeroSeries(periodCount),
      children: [],
    });
  }

  const roots: MutableCategoryNode[] = [];
  for (const [id, node] of nodes) {
    const category = categoryById.get(id);
    const parent = category?.parentCategoryId ? nodes.get(category.parentCategoryId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const uncategorized = directByCategory.get(null);
  if (uncategorized && uncategorized.some((amount) => amount !== 0)) {
    roots.push({
      categoryId: null,
      name: "Sem categoria",
      status: "synthetic",
      direct: uncategorized,
      children: [],
    });
  }

  const materialized = roots
    .map((root) => materializeCategoryNode(root, sectionDenominators, new Set()))
    .filter((node): node is CategoryEvolutionCategoryNode => node !== undefined);

  return sortCategoryNodes(materialized);
}

function materializeCategoryNode(
  node: MutableCategoryNode,
  denominators: readonly number[],
  ancestors: ReadonlySet<string>,
): CategoryEvolutionCategoryNode | undefined {
  const key = node.categoryId ?? "__uncategorized__";
  if (ancestors.has(key)) return undefined;
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(key);
  const children = node.children
    .map((child) => materializeCategoryNode(child, denominators, nextAncestors))
    .filter((child): child is CategoryEvolutionCategoryNode => child !== undefined);
  const consolidated = node.direct.slice();

  for (const child of children) {
    child.series.cells.forEach((cell, index) => {
      consolidated[index] = (consolidated[index] ?? 0) + cell.amountMinor;
    });
  }

  if (consolidated.every((amount) => amount === 0)) return undefined;

  return {
    categoryId: node.categoryId,
    name: node.name,
    status: node.status,
    series: buildSeries(consolidated, denominators),
    children: sortCategoryNodes(children),
  };
}

function sortCategoryNodes(
  nodes: readonly CategoryEvolutionCategoryNode[],
): CategoryEvolutionCategoryNode[] {
  return nodes.slice().sort((left, right) => {
    const magnitudeDifference =
      Math.abs(right.series.totalMinor) - Math.abs(left.series.totalMinor);
    return magnitudeDifference || left.name.localeCompare(right.name, "pt-BR");
  });
}

function sumSection(
  movements: readonly AggregatedMovementRow[],
  kind: "income" | "expense",
  periodCount: number,
): number[] {
  const values = zeroSeries(periodCount);
  for (const movement of movements) {
    if (movement.kind !== kind) continue;
    values[movement.periodIndex] =
      (values[movement.periodIndex] ?? 0) + toSafeMinor(movement.amountMinor);
  }
  return values;
}

function buildSeries(
  amounts: readonly number[],
  denominators: readonly number[] | undefined,
): CategoryEvolutionSeries {
  const totalMinor = normalizeZero(amounts.reduce((total, amount) => total + amount, 0));
  const denominatorTotal = denominators?.reduce((total, amount) => total + amount, 0);
  const totalPercentage =
    denominators === undefined ? null : percentage(totalMinor, denominatorTotal ?? 0);

  return {
    cells: amounts.map((amount, index) => ({
      amountMinor: normalizeZero(amount),
      percentage: denominators === undefined ? null : percentage(amount, denominators[index] ?? 0),
    })),
    totalMinor,
    totalPercentage,
    averageMinor: roundHalfAwayFromZero(totalMinor / Math.max(amounts.length, 1)),
    averagePercentage: totalPercentage,
  };
}

function parseInterval(value: string): CategoryEvolutionInterval {
  if (value === "monthly" || value === "annual" || value === "rolling-year") return value;
  throw new CategoryEvolutionFilterError(
    "Intervalo inválido. Escolha mensal, anual ou anual com início móvel.",
  );
}

function parsePeriodCount(
  value: string,
  maxPeriods: number,
  interval: CategoryEvolutionInterval,
): number {
  if (!/^\d+$/.test(value)) {
    throw new CategoryEvolutionFilterError(
      "Período inválido. Informe uma quantidade inteira de colunas.",
    );
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > maxPeriods) {
    const unit = interval === "monthly" ? "meses" : "períodos";
    throw new CategoryEvolutionFilterError(
      `Período inválido. Informe entre 1 e ${maxPeriods} ${unit}.`,
    );
  }
  return parsed;
}

function validateStart(interval: CategoryEvolutionInterval, value: string): string {
  if (interval === "annual") {
    if (!/^\d{4}$/.test(value)) {
      throw new CategoryEvolutionFilterError("Início inválido. Informe um ano no formato AAAA.");
    }
    const year = Number(value);
    if (year < 1 || year > 9999) {
      throw new CategoryEvolutionFilterError("Início inválido. Informe um ano entre 0001 e 9999.");
    }
    return value;
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new CategoryEvolutionFilterError("Início inválido. Informe um mês no formato AAAA-MM.");
  }
  const year = Number(value.slice(0, 4));
  if (year < 1 || year > 9999) {
    throw new CategoryEvolutionFilterError("Início inválido. Informe um ano entre 0001 e 9999.");
  }
  return value;
}

function deriveDefaultStart(
  interval: CategoryEvolutionInterval,
  periodCount: number,
  referenceDate: Date,
): string {
  const currentYear = referenceDate.getUTCFullYear();
  const currentMonth = referenceDate.getUTCMonth() + 1;

  if (interval === "annual") {
    const year = currentYear - (periodCount - 1);
    assertRepresentableYear(year);
    return String(year).padStart(4, "0");
  }

  const monthOffset = interval === "monthly" ? -(periodCount - 1) : -(periodCount * 12 - 1);
  const start = addMonths(currentYear, currentMonth, monthOffset);
  return formatYearMonth(start.year, start.month);
}

function buildPeriods(
  interval: CategoryEvolutionInterval,
  start: string,
  periodCount: number,
): CategoryEvolutionPeriod[] {
  if (interval === "annual") {
    const startYear = Number(start);
    return Array.from({ length: periodCount }, (_, index) => {
      const year = startYear + index;
      assertRepresentableYear(year);
      const label = String(year).padStart(4, "0");
      return {
        key: label,
        label,
        accessibleLabel: `Ano de ${label}`,
        startsOn: `${label}-01-01`,
        endsOn: `${label}-12-31`,
      };
    });
  }

  const startYear = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7));
  return Array.from({ length: periodCount }, (_, index) => {
    const first = addMonths(startYear, startMonth, index * (interval === "monthly" ? 1 : 12));
    if (interval === "monthly") return monthlyPeriod(first.year, first.month);
    const last = addMonths(first.year, first.month, 11);
    return {
      key: `${formatYearMonth(first.year, first.month)}_${formatYearMonth(last.year, last.month)}`,
      label: `${compactMonth(first.year, first.month)}–${compactMonth(last.year, last.month)}`,
      accessibleLabel: `${accessibleMonth(first.year, first.month)} a ${accessibleMonth(last.year, last.month)}`,
      startsOn: `${formatYearMonth(first.year, first.month)}-01`,
      endsOn: `${formatYearMonth(last.year, last.month)}-${String(daysInMonth(last.year, last.month)).padStart(2, "0")}`,
    };
  });
}

function monthlyPeriod(year: number, month: number): CategoryEvolutionPeriod {
  const yearMonth = formatYearMonth(year, month);
  return {
    key: yearMonth,
    label: compactMonth(year, month),
    accessibleLabel: accessibleMonth(year, month),
    startsOn: `${yearMonth}-01`,
    endsOn: `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
  };
}

function compactMonth(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]}/${String(year).slice(-2)}`;
}

function accessibleMonth(year: number, month: number): string {
  return `${MONTH_ACCESSIBLE_LABELS[month - 1]} de ${String(year).padStart(4, "0")}`;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const absolute = year * 12 + (month - 1) + offset;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (((absolute % 12) + 12) % 12) + 1;
  assertRepresentableYear(nextYear);
  return { year: nextYear, month: nextMonth };
}

function assertRepresentableYear(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new CategoryEvolutionFilterError(
      "O período calculado ultrapassa o intervalo de anos suportado.",
    );
  }
}

function formatYearMonth(year: number, month: number): string {
  assertRepresentableYear(year);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return new Set([4, 6, 9, 11]).has(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function zeroSeries(periodCount: number): number[] {
  return Array.from({ length: periodCount }, () => 0);
}

function toSafeMinor(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw Object.assign(new Error("Valor agregado fora do intervalo seguro."), {
      code: "REPORT_CATEGORY_EVOLUTION_AMOUNT_UNSAFE",
      statusCode: 500,
    });
  }
  return Math.abs(parsed);
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return normalizeZero(Math.round((numerator / denominator) * 10_000) / 100);
}

function roundHalfAwayFromZero(value: number): number {
  if (value === 0) return 0;
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
