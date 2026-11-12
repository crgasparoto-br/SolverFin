import type { TenantContext } from "@solverfin/domain";

import {
  buildCategoryEvolutionReport,
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

export type CategoryEvolutionSourceFilter =
  | { kind: "all" }
  | { kind: "account"; id: string }
  | { kind: "card"; id: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CategoryEvolutionSourceNotAvailableError extends Error {
  readonly code = "REPORT_CATEGORY_EVOLUTION_SOURCE_NOT_AVAILABLE";
  readonly statusCode = 404;

  constructor() {
    super("A conta ou o cartão informado não está disponível para este relatório.");
    this.name = "CategoryEvolutionSourceNotAvailableError";
  }
}

export function parseCategoryEvolutionSourceFilter(
  searchParams: URLSearchParams,
): CategoryEvolutionSourceFilter {
  const accountId = searchParams.get("accountId");
  const cardId = searchParams.get("cardId");

  if (accountId !== null && cardId !== null) {
    throw new CategoryEvolutionFilterError(
      "Filtro inválido. Informe somente uma conta ou um cartão de crédito.",
    );
  }

  if (accountId !== null) {
    return { kind: "account", id: parseSourceId(accountId, "Conta") };
  }

  if (cardId !== null) {
    return { kind: "card", id: parseSourceId(cardId, "Cartão") };
  }

  return { kind: "all" };
}

export async function buildCategoryEvolutionReportForSourceContext(
  context: TenantContext,
  filters: CategoryEvolutionFilters,
  source: CategoryEvolutionSourceFilter,
): Promise<CategoryEvolutionReport> {
  if (source.kind !== "all") {
    await assertSourceAvailableForContext(context, source);
  }

  const invoicePaymentExclusionPredicate = `not exists (
            select 1
              from "Invoice" invoice
             where invoice."organizationId" = $1
               and invoice."financialProfileId" = $2
               and invoice."paymentTransactionId" = movement."id"
          )`;
  const sourcePredicate =
    source.kind === "all"
      ? invoicePaymentExclusionPredicate
      : source.kind === "account"
        ? `movement."accountId" = $5
          and ${invoicePaymentExclusionPredicate}`
        : `movement."cardId" = $5
          and ${invoicePaymentExclusionPredicate}`;

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
          and ${sourcePredicate}
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
        ...(source.kind === "all" ? [] : [source.id]),
      ],
    ),
  ]);

  return buildCategoryEvolutionReport(filters, { categories, movements });
}

function parseSourceId(value: string, label: "Conta" | "Cartão"): string {
  if (!UUID_PATTERN.test(value)) {
    throw new CategoryEvolutionFilterError(
      `${label === "Conta" ? "Conta inválida" : "Cartão inválido"}. Informe um identificador válido.`,
    );
  }

  return value.toLowerCase();
}

async function assertSourceAvailableForContext(
  context: TenantContext,
  source: Exclude<CategoryEvolutionSourceFilter, { kind: "all" }>,
): Promise<void> {
  const rows =
    source.kind === "account"
      ? await query<{ id: string }>(
          `select "id"
             from "Account"
            where "id" = $1
              and "organizationId" = $2
              and "financialProfileId" = $3
              and lower("status"::text) = 'active'
            limit 1`,
          [source.id, context.organizationId, context.financialProfileId],
        )
      : await query<{ id: string }>(
          `select "id"
             from "Card"
            where "id" = $1
              and "organizationId" = $2
              and "financialProfileId" = $3
              and lower("status"::text) in ('active', 'blocked')
            limit 1`,
          [source.id, context.organizationId, context.financialProfileId],
        );

  if (!rows[0]) {
    throw new CategoryEvolutionSourceNotAvailableError();
  }
}
