import type { TenantContext } from "@solverfin/domain";

import {
  buildCategoryEvolutionReport,
  buildCategoryEvolutionReportForContext,
  CategoryEvolutionFilterError,
  type CategoryEvolutionFilters,
  type CategoryEvolutionReport,
} from "./category-evolution-report.js";
import { query } from "./db.js";

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CategoryEvolutionAccountNotAvailableError extends Error {
  readonly code = "REPORT_CATEGORY_EVOLUTION_ACCOUNT_NOT_AVAILABLE";
  readonly statusCode = 404;

  constructor() {
    super("A conta informada não está disponível para este relatório.");
    this.name = "CategoryEvolutionAccountNotAvailableError";
  }
}

export function parseCategoryEvolutionAccountId(
  searchParams: URLSearchParams,
): string | undefined {
  const value = searchParams.get("accountId");
  if (value === null) return undefined;

  if (!UUID_PATTERN.test(value)) {
    throw new CategoryEvolutionFilterError(
      "Conta inválida. Informe um identificador de conta válido.",
    );
  }

  return value.toLowerCase();
}

export async function buildCategoryEvolutionReportForAccountContext(
  context: TenantContext,
  filters: CategoryEvolutionFilters,
  accountId: string | undefined,
): Promise<CategoryEvolutionReport> {
  if (accountId === undefined) {
    return buildCategoryEvolutionReportForContext(context, filters);
  }

  await assertActiveAccountForContext(context, accountId);

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
          and movement."accountId" = $5
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
        accountId,
      ],
    ),
  ]);

  return buildCategoryEvolutionReport(filters, { categories, movements });
}

async function assertActiveAccountForContext(
  context: TenantContext,
  accountId: string,
): Promise<void> {
  const accounts = await query<{ id: string }>(
    `select "id"
       from "Account"
      where "id" = $1
        and "organizationId" = $2
        and "financialProfileId" = $3
        and lower("status"::text) = 'active'
      limit 1`,
    [accountId, context.organizationId, context.financialProfileId],
  );

  if (!accounts[0]) {
    throw new CategoryEvolutionAccountNotAvailableError();
  }
}
