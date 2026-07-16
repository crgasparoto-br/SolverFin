import { query, type QueryExecutor } from "../db.js";
import type { OperationRecord } from "./account-remuneration-service.js";
import type {
  DatePeriod,
  DiagnosedOperationRecord,
  OperationDiagnostics,
  RolledBackOperation,
} from "./account-remuneration-diagnostics-types.js";

interface ProcessingSnapshotRow {
  activeConfigurations: number;
  notEligibleConfigurations: number;
  configurationsWithoutRates: number;
  alreadyRegisteredCompetences: number;
}

interface DiagnosticsRow {
  diagnostics: unknown;
}

export interface FutureCdiRepairResult {
  rejectedRates: number;
  disabledSyntheticConfigurations: number;
}

export async function readProcessingSnapshot(
  processedOn: string,
  executeQuery: QueryExecutor = query,
): Promise<ProcessingSnapshotRow> {
  const rows = await executeQuery<ProcessingSnapshotRow>(
    `select
       (select count(*)::int
          from "AccountRemunerationConfiguration" c
          join "Account" a
            on a."id" = c."accountId"
           and a."organizationId" = c."organizationId"
           and a."financialProfileId" = c."financialProfileId"
         where c."enabled" = true
           and a."status" = 'ACTIVE'
           and a."currency" = 'BRL') as "activeConfigurations",
       (select count(*)::int
          from "AccountRemunerationConfiguration" c
          join "Account" a
            on a."id" = c."accountId"
           and a."organizationId" = c."organizationId"
           and a."financialProfileId" = c."financialProfileId"
         where c."enabled" = true
           and a."status" = 'ACTIVE'
           and a."currency" = 'BRL'
           and c."startsOn" >= $1::date) as "notEligibleConfigurations",
       (select count(*)::int
          from "AccountRemunerationConfiguration" c
          join "Account" a
            on a."id" = c."accountId"
           and a."organizationId" = c."organizationId"
           and a."financialProfileId" = c."financialProfileId"
         where c."enabled" = true
           and a."status" = 'ACTIVE'
           and a."currency" = 'BRL'
           and c."startsOn" < $1::date
           and not exists (
             select 1
               from "FinancialIndexRate" r
              where r."kind" = c."indexKind"
                and r."status" = 'CONFIRMED'
                and r."referenceOn" >= c."startsOn"
                and r."referenceOn" < $1::date
           )) as "configurationsWithoutRates",
       (select count(*)::int
          from "AccountRemunerationConfiguration" c
          join "Account" a
            on a."id" = c."accountId"
           and a."organizationId" = c."organizationId"
           and a."financialProfileId" = c."financialProfileId"
          join "FinancialIndexRate" r
            on r."kind" = c."indexKind"
           and r."status" = 'CONFIRMED'
           and r."referenceOn" >= c."startsOn"
           and r."referenceOn" < $1::date
         where c."enabled" = true
           and a."status" = 'ACTIVE'
           and a."currency" = 'BRL'
           and exists (
             select 1
               from "AccountRemuneration" ar
              where ar."organizationId" = c."organizationId"
                and ar."financialProfileId" = c."financialProfileId"
                and ar."accountId" = c."accountId"
                and ar."competenceOn" = r."referenceOn"
                and ar."indexKind" = c."indexKind"
           )) as "alreadyRegisteredCompetences"`,
    [processedOn],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Não foi possível calcular o diagnóstico do processamento CDI.");
  }
  return row;
}

export async function repairFutureCdiTestContamination(
  executeQuery: QueryExecutor = query,
): Promise<FutureCdiRepairResult> {
  const rejectedRates = await executeQuery<{ id: string }>(
    `update "FinancialIndexRate"
        set "status" = 'REJECTED',
            "updatedAt" = now()
      where "kind" = 'CDI'
        and "status" = 'CONFIRMED'
        and "referenceOn" = date '2038-04-14'
        and "dailyRatePercent" = 0.055131
        and "source" = 'BCB_SGS_12'
      returning "id"`,
  );

  const disabledConfigurations = await executeQuery<{ id: string }>(
    `update "AccountRemunerationConfiguration" c
        set "enabled" = false,
            "updatedAt" = now()
       from "Account" a
      where a."id" = c."accountId"
        and a."organizationId" = c."organizationId"
        and a."financialProfileId" = c."financialProfileId"
        and c."enabled" = true
        and c."startsOn" >= date '2037-01-01'
        and (
          a."name" like 'Conta remunerada positiva %'
          or a."name" like 'Conta remunerada negativa %'
          or a."name" like 'Conta remunerada sem taxa %'
        )
      returning c."id"`,
  );

  return {
    rejectedRates: rejectedRates.length,
    disabledSyntheticConfigurations: disabledConfigurations.length,
  };
}

export async function findLatestCdiReferenceDate(
  executeQuery: QueryExecutor = query,
  maximumReferenceOn?: string,
): Promise<string | null> {
  const rows = await executeQuery<{ referenceOn: Date }>(
    `select "referenceOn"
       from "FinancialIndexRate"
      where "kind" = 'CDI'
        and "status" = 'CONFIRMED'
        and ($1::date is null or "referenceOn" <= $1::date)
      order by "referenceOn" desc
      limit 1`,
    [maximumReferenceOn ?? null],
  );

  return rows[0] ? toDateOnly(rows[0].referenceOn) : null;
}

export async function persistOperationDiagnostics<
  TDiagnostics extends OperationDiagnostics,
>(
  operation: OperationRecord,
  diagnostics: TDiagnostics,
  message: string,
  executeQuery: QueryExecutor = query,
): Promise<DiagnosedOperationRecord> {
  await executeQuery(
    `update "FinancialIndexOperation"
        set "diagnostics" = $2::jsonb,
            "message" = $3,
            "updatedAt" = now()
      where "id" = $1`,
    [operation.id, JSON.stringify(diagnostics), message],
  );

  return { ...operation, message, diagnostics };
}

export async function persistCurrentFailedDiagnostics(
  kind: OperationDiagnostics["kind"],
  diagnostics: OperationDiagnostics,
  executeQuery: QueryExecutor = query,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `update "FinancialIndexOperation"
        set "diagnostics" = $2::jsonb,
            "updatedAt" = now()
      where "id" = (
        select "id"
          from "FinancialIndexOperation"
         where "kind" = $1
           and "status" = 'FAILED'
           and xmin = txid_current()::text::xid
         limit 1
      )
      returning "id"`,
    [kind, JSON.stringify(diagnostics)],
  );

  if (!rows[0]) {
    throw new Error(
      "Não foi possível correlacionar o diagnóstico à operação CDI com falha.",
    );
  }
}

export async function recordRolledBackOperation(
  operation: RolledBackOperation,
): Promise<void> {
  try {
    await query(
      `insert into "FinancialIndexOperation"
        ("id", "kind", "status", "startedAt", "completedAt", "failureCount",
         "message", "diagnostics", "createdAt", "updatedAt")
       values ($1, $2, 'FAILED', now(), now(), 1, $3, $4::jsonb, now(), now())
       on conflict ("id") do update set
         "status" = 'FAILED',
         "completedAt" = now(),
         "failureCount" = 1,
         "message" = excluded."message",
         "diagnostics" = excluded."diagnostics",
         "updatedAt" = now()`,
      [
        operation.id,
        operation.kind,
        operation.message,
        operation.diagnostics ? JSON.stringify(operation.diagnostics) : null,
      ],
    );
  } catch {
    // Preserve the original error. The successful financial transaction was
    // already rolled back by the enclosing transaction.
  }
}

export async function attachDiagnostics(
  operation: OperationRecord | null,
): Promise<DiagnosedOperationRecord | null> {
  if (!operation) return null;

  const rows = await query<DiagnosticsRow>(
    `select "diagnostics" from "FinancialIndexOperation" where "id" = $1`,
    [operation.id],
  );

  return {
    ...operation,
    diagnostics: parseDiagnostics(rows[0]?.diagnostics),
  };
}

export function readProviderPeriod(
  resource: Parameters<typeof fetch>[0],
): DatePeriod | null {
  const rawUrl =
    typeof resource === "string"
      ? resource
      : resource instanceof URL
        ? resource.toString()
        : resource.url;
  const endpoint = new URL(rawUrl);
  const startsOn = parseBrazilianDate(endpoint.searchParams.get("dataInicial"));
  const endsOn = parseBrazilianDate(endpoint.searchParams.get("dataFinal"));
  return startsOn && endsOn ? { startsOn, endsOn } : null;
}

function parseDiagnostics(value: unknown): OperationDiagnostics | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("kind" in value)) return null;
  const kind = (value as { kind?: unknown }).kind;
  if (kind !== "CDI_IMPORT" && kind !== "ACCOUNT_REMUNERATION") return null;
  return value as OperationDiagnostics;
}

function parseBrazilianDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
