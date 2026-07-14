import { randomUUID } from "node:crypto";

import {
  calculateAccountRemuneration,
  type TenantContext,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import {
  importCdiRates as importCdiRatesBase,
  listAccountRemunerationConfigurations,
  saveAccountRemunerationConfiguration,
  type AccountRemunerationConfigurationRecord,
  type ImportCdiRatesResult,
  type OperationRecord,
  type SaveAccountRemunerationConfigurationInput,
} from "./account-remuneration.js";

export {
  listAccountRemunerationConfigurations,
  saveAccountRemunerationConfiguration,
};
export type {
  AccountRemunerationConfigurationRecord,
  OperationRecord,
  SaveAccountRemunerationConfigurationInput,
};

export interface ImportCdiRatesInput {
  startsOn?: string;
  endsOn?: string;
}

export interface FinancialIndexStatusRecord {
  latestCdiRate: {
    referenceOn: string;
    dailyRatePercent: number;
    source: string;
    importedAt: string;
  } | null;
  latestImport: OperationRecord | null;
  latestProcessing: OperationRecord | null;
  activeConfigurations: number;
  pendingCompetences: number;
  configurationsWithoutRates: number;
}

export interface ProcessAccountRemunerationsResult {
  operation: OperationRecord;
  processedCount: number;
  createdCount: number;
  skippedCount: number;
  pendingCount: number;
  skippedWithoutPositiveBalance: number;
  skippedZeroAmount: number;
}

type ExecuteQuery = typeof query;

type RemunerationResultStatus =
  | "CREATED"
  | "SKIPPED_NON_POSITIVE_BALANCE"
  | "SKIPPED_ZERO_AMOUNT";

interface CandidateRow {
  id: string;
  referenceOn: Date;
  dailyRatePercent: string;
  dailyFactor: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string;
  accountName: string;
  currency: string;
  openingBalanceMinor: number;
  remunerationPercent: string;
  categoryId: string | null;
}

interface OperationRow {
  id: string;
  kind: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  importedCount: number;
  processedCount: number;
  createdCount: number;
  pendingCount: number;
  failureCount: number;
  message: string | null;
}

const CDI_KIND = "CDI";

export async function importCdiRates(
  input: ImportCdiRatesInput = {},
  fetcher: typeof fetch = fetch,
): Promise<ImportCdiRatesResult> {
  const endsOn = normalizeDate(input.endsOn ?? today());
  const latest = await findLatestCdiReferenceDate();
  const requestedStart = input.startsOn ? normalizeDate(input.startsOn) : addDays(endsOn, -10);
  const startsOn = latest ? maxDate(addDays(latest, 1), requestedStart) : requestedStart;

  if (startsOn > endsOn) {
    return importCdiRatesBase({ startsOn: endsOn, endsOn }, fetcher);
  }

  return importCdiRatesBase({ startsOn, endsOn }, fetcher);
}

export async function processAccountRemunerations(
  processedOn = today(),
): Promise<ProcessAccountRemunerationsResult> {
  const normalizedProcessedOn = normalizeDate(processedOn);
  const operationId = randomUUID();
  let operation: OperationRecord | undefined;
  let processedCount = 0;
  let createdCount = 0;
  let skippedWithoutPositiveBalance = 0;
  let skippedZeroAmount = 0;
  let pendingCount = 0;

  await createOperation(operationId, "ACCOUNT_REMUNERATION");

  try {
    await withTransaction(async (executeQuery) => {
      const lockRows = await executeQuery<{ acquired: boolean }>(
        `select pg_try_advisory_xact_lock(hashtext('solverfin:account-remuneration')) as "acquired"`,
      );

      if (!lockRows[0]?.acquired) {
        throw repositoryError(
          "ACCOUNT_REMUNERATION_ALREADY_RUNNING",
          "Já existe um processamento de remuneração em andamento.",
          409,
        );
      }

      const candidates = await listPendingCandidates(executeQuery, normalizedProcessedOn);
      processedCount = candidates.length;

      for (const candidate of candidates) {
        const balanceBaseMinor = await calculateClosingBalance(executeQuery, candidate);
        const calculation = calculateAccountRemuneration({
          balanceMinor: balanceBaseMinor,
          dailyRatePercent: Number(candidate.dailyRatePercent),
          remunerationPercent: Number(candidate.remunerationPercent),
        });

        if (balanceBaseMinor <= 0) {
          await createRemunerationResult(
            executeQuery,
            candidate,
            normalizedProcessedOn,
            calculation,
            "SKIPPED_NON_POSITIVE_BALANCE",
          );
          skippedWithoutPositiveBalance += 1;
          continue;
        }

        if (calculation.amountMinor <= 0) {
          await createRemunerationResult(
            executeQuery,
            candidate,
            normalizedProcessedOn,
            calculation,
            "SKIPPED_ZERO_AMOUNT",
          );
          skippedZeroAmount += 1;
          continue;
        }

        const transactionId = await createRemunerationTransaction(
          executeQuery,
          candidate,
          normalizedProcessedOn,
          calculation,
        );
        await createRemunerationResult(
          executeQuery,
          candidate,
          normalizedProcessedOn,
          calculation,
          "CREATED",
          transactionId,
        );
        createdCount += 1;
      }

      pendingCount = await countPendingCompetences(executeQuery, normalizedProcessedOn);
      const skippedCount = skippedWithoutPositiveBalance + skippedZeroAmount;
      operation = await finishOperation(
        operationId,
        {
          status: pendingCount > 0 ? "PARTIAL" : "SUCCESS",
          processedCount,
          createdCount,
          pendingCount,
          message:
            processedCount === 0
              ? "Nenhuma competência pendente precisava ser processada."
              : `${createdCount} rendimento(s) criado(s) e ${skippedCount} competência(s) concluída(s) sem lançamento.`,
        },
        executeQuery,
      );
    });
  } catch (error) {
    await finishOperation(operationId, {
      status: "FAILED",
      processedCount,
      createdCount,
      pendingCount,
      failureCount: 1,
      message: readableError(error),
    });
    throw error;
  }

  return {
    operation: requireRow(operation),
    processedCount,
    createdCount,
    skippedCount: skippedWithoutPositiveBalance + skippedZeroAmount,
    pendingCount,
    skippedWithoutPositiveBalance,
    skippedZeroAmount,
  };
}

export async function getFinancialIndexStatus(): Promise<FinancialIndexStatusRecord> {
  const latestRates = await query<{
    referenceOn: Date;
    dailyRatePercent: string;
    source: string;
    importedAt: Date;
  }>(
    `select "referenceOn", "dailyRatePercent", "source", "importedAt"
       from "FinancialIndexRate"
      where "kind" = $1 and "status" = 'CONFIRMED'
      order by "referenceOn" desc
      limit 1`,
    [CDI_KIND],
  );
  const latestRate = latestRates[0];
  const [latestImport, latestProcessing, counts] = await Promise.all([
    findLatestOperation("CDI_IMPORT"),
    findLatestOperation("ACCOUNT_REMUNERATION"),
    query<{
      activeConfigurations: number;
      pendingCompetences: number;
      configurationsWithoutRates: number;
    }>(
      `select
         (select count(*)::int
            from "AccountRemunerationConfiguration" c
           where c."enabled" = true) as "activeConfigurations",
         (select count(*)::int
            from "AccountRemunerationConfiguration" c
            join "Account" a
              on a."id" = c."accountId"
             and a."organizationId" = c."organizationId"
             and a."financialProfileId" = c."financialProfileId"
            join "FinancialIndexRate" r
              on r."kind" = c."indexKind"
             and r."referenceOn" >= c."startsOn"
             and r."referenceOn" < current_date
             and r."status" = 'CONFIRMED'
           where c."enabled" = true
             and a."status" = 'ACTIVE'
             and a."currency" = 'BRL'
             and not exists (
               select 1 from "AccountRemuneration" ar
                where ar."organizationId" = c."organizationId"
                  and ar."financialProfileId" = c."financialProfileId"
                  and ar."accountId" = c."accountId"
                  and ar."competenceOn" = r."referenceOn"
                  and ar."indexKind" = c."indexKind"
             )) as "pendingCompetences",
         (select count(*)::int
            from "AccountRemunerationConfiguration" c
           where c."enabled" = true
             and not exists (
               select 1 from "FinancialIndexRate" r
                where r."kind" = c."indexKind"
                  and r."status" = 'CONFIRMED'
                  and r."referenceOn" >= c."startsOn"
                  and r."referenceOn" < current_date
             )) as "configurationsWithoutRates"`,
    ),
  ]);
  const countRow = counts[0];

  return {
    latestCdiRate: latestRate
      ? {
          referenceOn: toDateOnly(latestRate.referenceOn),
          dailyRatePercent: Number(latestRate.dailyRatePercent),
          source: latestRate.source,
          importedAt: latestRate.importedAt.toISOString(),
        }
      : null,
    latestImport,
    latestProcessing,
    activeConfigurations: countRow?.activeConfigurations ?? 0,
    pendingCompetences: countRow?.pendingCompetences ?? 0,
    configurationsWithoutRates: countRow?.configurationsWithoutRates ?? 0,
  };
}

async function listPendingCandidates(
  executeQuery: ExecuteQuery,
  processedOn: string,
): Promise<CandidateRow[]> {
  return executeQuery<CandidateRow>(
    `select r."id", r."referenceOn", r."dailyRatePercent", r."dailyFactor",
            c."organizationId", c."financialProfileId", c."accountId",
            a."name" as "accountName", a."currency", a."openingBalanceMinor",
            c."remunerationPercent", c."categoryId"
       from "AccountRemunerationConfiguration" c
       join "Account" a
         on a."id" = c."accountId"
        and a."organizationId" = c."organizationId"
        and a."financialProfileId" = c."financialProfileId"
       join "FinancialIndexRate" r
         on r."kind" = c."indexKind"
        and r."referenceOn" >= c."startsOn"
        and r."referenceOn" < $1::date
        and r."status" = 'CONFIRMED'
      where c."enabled" = true
        and a."status" = 'ACTIVE'
        and a."currency" = 'BRL'
        and not exists (
          select 1 from "AccountRemuneration" ar
           where ar."organizationId" = c."organizationId"
             and ar."financialProfileId" = c."financialProfileId"
             and ar."accountId" = c."accountId"
             and ar."competenceOn" = r."referenceOn"
             and ar."indexKind" = c."indexKind"
        )
      order by r."referenceOn" asc, a."name" asc`,
    [processedOn],
  );
}

async function calculateClosingBalance(
  executeQuery: ExecuteQuery,
  candidate: CandidateRow,
): Promise<number> {
  const rows = await executeQuery<{ balanceMinor: number }>(
    `select ($4::int + coalesce(sum(
       case
         when t."kind" = 'INCOME' and t."accountId" = $3 then t."amountMinor"
         when t."kind" = 'EXPENSE' and t."accountId" = $3 then -t."amountMinor"
         when t."kind" = 'TRANSFER' and t."destinationAccountId" = $3 then t."amountMinor"
         when t."kind" = 'TRANSFER' and t."accountId" = $3 then -t."amountMinor"
         else 0
       end
     ), 0))::int as "balanceMinor"
       from "Transaction" t
      where t."organizationId" = $1
        and t."financialProfileId" = $2
        and (t."accountId" = $3 or t."destinationAccountId" = $3)
        and t."status" <> 'VOIDED'
        and t."effectiveOn" is not null
        and t."effectiveOn" <= $5::date`,
    [
      candidate.organizationId,
      candidate.financialProfileId,
      candidate.accountId,
      candidate.openingBalanceMinor,
      toDateOnly(candidate.referenceOn),
    ],
  );

  return rows[0]?.balanceMinor ?? candidate.openingBalanceMinor;
}

async function createRemunerationTransaction(
  executeQuery: ExecuteQuery,
  candidate: CandidateRow,
  processedOn: string,
  calculation: ReturnType<typeof calculateAccountRemuneration>,
): Promise<string> {
  const transactionId = randomUUID();
  const competenceOn = toDateOnly(candidate.referenceOn);
  const description = buildRemunerationDescription(calculation, competenceOn);
  const now = new Date().toISOString();

  await executeQuery(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "categoryId",
       "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
       "effectiveOn", "description", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'INCOME', 'PLANNED', 'ACCOUNT_REMUNERATION', $6, $7,
             $8, $8, null, $9, $10, $10)`,
    [
      transactionId,
      candidate.organizationId,
      candidate.financialProfileId,
      candidate.accountId,
      candidate.categoryId,
      calculation.amountMinor,
      candidate.currency,
      processedOn,
      description,
      now,
    ],
  );

  return transactionId;
}

async function createRemunerationResult(
  executeQuery: ExecuteQuery,
  candidate: CandidateRow,
  processedOn: string,
  calculation: ReturnType<typeof calculateAccountRemuneration>,
  status: RemunerationResultStatus,
  transactionId?: string,
): Promise<void> {
  const now = new Date().toISOString();

  await executeQuery(
    `insert into "AccountRemuneration"
      ("id", "organizationId", "financialProfileId", "accountId", "financialIndexRateId",
       "transactionId", "indexKind", "competenceOn", "processedOn", "status",
       "balanceBaseMinor", "dailyRatePercent", "remunerationPercent",
       "appliedDailyRatePercent", "originalAmountMinor", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)`,
    [
      randomUUID(),
      candidate.organizationId,
      candidate.financialProfileId,
      candidate.accountId,
      candidate.id,
      transactionId ?? null,
      CDI_KIND,
      toDateOnly(candidate.referenceOn),
      processedOn,
      status,
      calculation.balanceMinor,
      calculation.dailyRatePercent,
      calculation.remunerationPercent,
      calculation.appliedDailyRatePercent,
      calculation.amountMinor,
      now,
    ],
  );
}

async function countPendingCompetences(
  executeQuery: ExecuteQuery,
  processedOn: string,
): Promise<number> {
  const rows = await executeQuery<{ count: number }>(
    `select count(*)::int as "count"
       from "AccountRemunerationConfiguration" c
       join "Account" a
         on a."id" = c."accountId"
        and a."organizationId" = c."organizationId"
        and a."financialProfileId" = c."financialProfileId"
       join "FinancialIndexRate" r
         on r."kind" = c."indexKind"
        and r."referenceOn" >= c."startsOn"
        and r."referenceOn" < $1::date
        and r."status" = 'CONFIRMED'
      where c."enabled" = true
        and a."status" = 'ACTIVE'
        and a."currency" = 'BRL'
        and not exists (
          select 1 from "AccountRemuneration" ar
           where ar."organizationId" = c."organizationId"
             and ar."financialProfileId" = c."financialProfileId"
             and ar."accountId" = c."accountId"
             and ar."competenceOn" = r."referenceOn"
             and ar."indexKind" = c."indexKind"
        )`,
    [processedOn],
  );

  return rows[0]?.count ?? 0;
}

async function findLatestCdiReferenceDate(): Promise<string | undefined> {
  const rows = await query<{ referenceOn: Date }>(
    `select "referenceOn" from "FinancialIndexRate"
      where "kind" = $1 and "status" = 'CONFIRMED'
      order by "referenceOn" desc limit 1`,
    [CDI_KIND],
  );

  return rows[0] ? toDateOnly(rows[0].referenceOn) : undefined;
}

async function createOperation(id: string, kind: string): Promise<void> {
  await query(
    `insert into "FinancialIndexOperation"
      ("id", "kind", "status", "startedAt", "createdAt", "updatedAt")
     values ($1, $2, 'RUNNING', now(), now(), now())`,
    [id, kind],
  );
}

async function finishOperation(
  id: string,
  update: {
    status: string;
    importedCount?: number;
    processedCount?: number;
    createdCount?: number;
    pendingCount?: number;
    failureCount?: number;
    message?: string;
  },
  executeQuery: ExecuteQuery = query,
): Promise<OperationRecord> {
  const rows = await executeQuery<OperationRow>(
    `update "FinancialIndexOperation" set
       "status" = $2,
       "completedAt" = now(),
       "importedCount" = $3,
       "processedCount" = $4,
       "createdCount" = $5,
       "pendingCount" = $6,
       "failureCount" = $7,
       "message" = $8,
       "updatedAt" = now()
     where "id" = $1
     returning "id", "kind", "status", "startedAt", "completedAt", "importedCount",
       "processedCount", "createdCount", "pendingCount", "failureCount", "message"`,
    [
      id,
      update.status,
      update.importedCount ?? 0,
      update.processedCount ?? 0,
      update.createdCount ?? 0,
      update.pendingCount ?? 0,
      update.failureCount ?? 0,
      update.message ?? null,
    ],
  );

  return mapOperationRow(requireRow(rows[0]));
}

async function findLatestOperation(kind: string): Promise<OperationRecord | null> {
  const rows = await query<OperationRow>(
    `select "id", "kind", "status", "startedAt", "completedAt", "importedCount",
            "processedCount", "createdCount", "pendingCount", "failureCount", "message"
       from "FinancialIndexOperation"
      where "kind" = $1
      order by "startedAt" desc
      limit 1`,
    [kind],
  );

  return rows[0] ? mapOperationRow(rows[0]) : null;
}

function mapOperationRow(row: OperationRow): OperationRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    importedCount: row.importedCount,
    processedCount: row.processedCount,
    createdCount: row.createdCount,
    pendingCount: row.pendingCount,
    failureCount: row.failureCount,
    message: row.message,
  };
}

function buildRemunerationDescription(
  calculation: ReturnType<typeof calculateAccountRemuneration>,
  competenceOn: string,
): string {
  const percentage = formatDecimal(calculation.remunerationPercent, 4);
  const dailyRate = formatDecimal(calculation.dailyRatePercent, 8);
  const balance = formatMinorCurrency(calculation.balanceMinor);
  const original = formatMinorCurrency(calculation.amountMinor);

  return truncate(
    `Rendimento previsto — ${percentage}% do CDI · competência ${competenceOn} · saldo-base ${balance} · CDI ${dailyRate}% · valor original ${original}`,
    240,
  );
}

function normalizeDate(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw repositoryError("DATE_INVALID", "Informe uma data válida no formato AAAA-MM-DD.");
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw repositoryError("DATE_INVALID", "Informe uma data válida.");
  }

  return normalized;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMinorCurrency(amountMinor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountMinor / 100);
}

function formatDecimal(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Falha não identificada.";
}

function requireRow<T>(row: T | undefined): T {
  if (!row) {
    throw repositoryError(
      "DATABASE_RESULT_MISSING",
      "A operação não retornou o registro esperado.",
      500,
    );
  }
  return row;
}

function repositoryError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
