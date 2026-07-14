import { randomUUID } from "node:crypto";

import {
  calculateAccountRemuneration,
  parseBcbSgsCdiResponse,
  validateRemunerationPercentage,
  type TenantContext,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";

export interface AccountRemunerationConfigurationRecord {
  id: string;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  enabled: boolean;
  indexKind: "cdi";
  remunerationPercent?: number;
  startsOn?: string;
  categoryId?: string;
  updatedAt: string;
}

export interface SaveAccountRemunerationConfigurationInput {
  enabled: boolean;
  remunerationPercent?: number;
  startsOn?: string;
  categoryId?: string;
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
  pendingConfigurations: number;
}

export interface OperationRecord {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  importedCount: number;
  processedCount: number;
  createdCount: number;
  pendingCount: number;
  failureCount: number;
  message: string | null;
}

export interface ImportCdiRatesInput {
  startsOn: string;
  endsOn: string;
}

export interface ImportCdiRatesResult {
  operation: OperationRecord;
  receivedCount: number;
  importedCount: number;
}

export interface ProcessAccountRemunerationsResult {
  operation: OperationRecord;
  processedCount: number;
  createdCount: number;
  pendingCount: number;
  skippedWithoutPositiveBalance: number;
}

type ExecuteQuery = typeof query;

interface ConfigurationRow {
  id: string;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  enabled: boolean;
  indexKind: string;
  remunerationPercent: string | null;
  startsOn: Date | null;
  categoryId: string | null;
  updatedAt: Date;
}

interface RateRow {
  id: string;
  referenceOn: Date;
  dailyRatePercent: string;
  dailyFactor: string;
}

interface CandidateRow extends RateRow {
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
const CDI_SOURCE = "BCB_SGS_12";
const DEFAULT_BCB_SGS_CDI_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados";

export async function listAccountRemunerationConfigurations(
  context: TenantContext,
): Promise<AccountRemunerationConfigurationRecord[]> {
  const rows = await query<ConfigurationRow>(
    `select c."id", a."id" as "accountId", a."name" as "accountName",
            a."currency" as "accountCurrency", c."enabled", c."indexKind",
            c."remunerationPercent", c."startsOn", c."categoryId", c."updatedAt"
       from "Account" a
       left join "AccountRemunerationConfiguration" c
         on c."organizationId" = a."organizationId"
        and c."financialProfileId" = a."financialProfileId"
        and c."accountId" = a."id"
      where a."organizationId" = $1
        and a."financialProfileId" = $2
        and a."status" = 'ACTIVE'
      order by a."name" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map((row) => mapConfigurationRow(row, context));
}

export async function saveAccountRemunerationConfiguration(
  context: TenantContext,
  accountId: string,
  input: SaveAccountRemunerationConfigurationInput,
): Promise<AccountRemunerationConfigurationRecord> {
  const accountRows = await query<{
    id: string;
    name: string;
    currency: string;
  }>(
    `select "id", "name", "currency" from "Account"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "status" = 'ACTIVE'`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const account = accountRows[0];

  if (!account) {
    throw repositoryError("ACCOUNT_NOT_FOUND", "Conta não encontrada para este perfil.", 404);
  }

  if (input.enabled && account.currency !== "BRL") {
    throw repositoryError(
      "ACCOUNT_REMUNERATION_CURRENCY_UNSUPPORTED",
      "A remuneração pelo CDI está disponível somente para contas em BRL.",
    );
  }

  const remunerationPercent = normalizeOptionalPercentage(input.remunerationPercent);
  const startsOn = normalizeOptionalDate(input.startsOn);
  const categoryId = normalizeOptionalId(input.categoryId);

  if (input.enabled && (remunerationPercent === undefined || startsOn === undefined)) {
    throw repositoryError(
      "ACCOUNT_REMUNERATION_CONFIGURATION_INCOMPLETE",
      "Informe o percentual do CDI e a data inicial para ativar a remuneração.",
    );
  }

  if (categoryId) {
    const categoryRows = await query<{ id: string }>(
      `select "id" from "Category"
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
          and "status" = 'ACTIVE' and "kind" = 'INCOME'`,
      [categoryId, context.organizationId, context.financialProfileId],
    );

    if (!categoryRows[0]) {
      throw repositoryError(
        "ACCOUNT_REMUNERATION_CATEGORY_INVALID",
        "Selecione uma categoria ativa de receita deste perfil.",
      );
    }
  }

  const rows = await query<ConfigurationRow>(
    `insert into "AccountRemunerationConfiguration"
      ("id", "organizationId", "financialProfileId", "accountId", "enabled", "indexKind",
       "remunerationPercent", "startsOn", "categoryId", "createdByUserId", "updatedByUserId",
       "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, now(), now())
     on conflict ("organizationId", "financialProfileId", "accountId") do update set
       "enabled" = excluded."enabled",
       "indexKind" = excluded."indexKind",
       "remunerationPercent" = excluded."remunerationPercent",
       "startsOn" = excluded."startsOn",
       "categoryId" = excluded."categoryId",
       "updatedByUserId" = excluded."updatedByUserId",
       "updatedAt" = now()
     returning "id", "accountId", $11::text as "accountName", $12::text as "accountCurrency",
       "enabled", "indexKind", "remunerationPercent", "startsOn", "categoryId", "updatedAt"`,
    [
      randomUUID(),
      context.organizationId,
      context.financialProfileId,
      accountId,
      input.enabled,
      CDI_KIND,
      remunerationPercent ?? null,
      startsOn ?? null,
      categoryId ?? null,
      context.userId,
      account.name,
      account.currency,
    ],
  );

  return mapConfigurationRow(requireRow(rows[0]), context);
}

export async function importCdiRates(
  input: ImportCdiRatesInput,
  fetcher: typeof fetch = fetch,
): Promise<ImportCdiRatesResult> {
  const startsOn = normalizeDate(input.startsOn);
  const endsOn = normalizeDate(input.endsOn);

  if (startsOn > endsOn) {
    throw repositoryError(
      "FINANCIAL_INDEX_PERIOD_INVALID",
      "A data inicial da importação deve ser anterior ou igual à data final.",
    );
  }

  const operationId = randomUUID();
  await createOperation(operationId, "CDI_IMPORT");

  try {
    const endpoint = buildBcbSgsCdiUrl(startsOn, endsOn);
    const response = await fetcher(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw repositoryError(
        "FINANCIAL_INDEX_PROVIDER_UNAVAILABLE",
        `O Banco Central respondeu com status ${response.status}.`,
        502,
      );
    }

    const rates = parseBcbSgsCdiResponse(await response.json());
    let importedCount = 0;

    await withTransaction(async (executeQuery) => {
      for (const rate of rates) {
        const inserted = await executeQuery<{ id: string }>(
          `insert into "FinancialIndexRate"
            ("id", "kind", "referenceOn", "dailyRatePercent", "dailyFactor", "source", "status",
             "importedAt", "createdAt", "updatedAt")
           values ($1, $2, $3, $4, $5, $6, 'CONFIRMED', now(), now(), now())
           on conflict ("kind", "referenceOn") do nothing
           returning "id"`,
          [
            randomUUID(),
            CDI_KIND,
            rate.referenceOn,
            rate.dailyRatePercent,
            rate.dailyFactor,
            CDI_SOURCE,
          ],
        );
        importedCount += inserted.length;
      }
    });

    const message =
      importedCount === 0
        ? "A série CDI já estava atualizada para o período informado."
        : `${importedCount} taxa(s) CDI importada(s) com sucesso.`;
    const operation = await finishOperation(operationId, {
      status: "SUCCESS",
      importedCount,
      message,
    });

    return { operation, receivedCount: rates.length, importedCount };
  } catch (error) {
    await finishOperation(operationId, {
      status: "FAILED",
      failureCount: 1,
      message: readableError(error),
    });
    throw error;
  }
}

export async function processAccountRemunerations(
  processedOn = new Date().toISOString().slice(0, 10),
): Promise<ProcessAccountRemunerationsResult> {
  const normalizedProcessedOn = normalizeDate(processedOn);
  const operationId = randomUUID();
  let operation: OperationRecord | undefined;
  let processedCount = 0;
  let createdCount = 0;
  let pendingCount = 0;
  let skippedWithoutPositiveBalance = 0;

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

      await createOperation(operationId, "ACCOUNT_REMUNERATION", executeQuery);
      const candidates = await listPendingCandidates(executeQuery, normalizedProcessedOn);
      processedCount = candidates.length;

      for (const candidate of candidates) {
        const balanceBaseMinor = await calculateClosingBalance(executeQuery, candidate);
        const calculation = calculateAccountRemuneration({
          balanceMinor: balanceBaseMinor,
          dailyRatePercent: Number(candidate.dailyRatePercent),
          remunerationPercent: Number(candidate.remunerationPercent),
        });

        if (calculation.amountMinor <= 0) {
          skippedWithoutPositiveBalance += 1;
          continue;
        }

        await createRemunerationTransaction(
          executeQuery,
          candidate,
          normalizedProcessedOn,
          calculation,
        );
        createdCount += 1;
      }

      pendingCount = await countPendingConfigurations(executeQuery, normalizedProcessedOn);
      operation = await finishOperation(
        operationId,
        {
          status: pendingCount > 0 ? "PARTIAL" : "SUCCESS",
          processedCount,
          createdCount,
          pendingCount,
          message:
            createdCount > 0
              ? `${createdCount} rendimento(s) previsto(s) criado(s).`
              : "Nenhum novo rendimento precisava ser criado.",
        },
        executeQuery,
      );
    });
  } catch (error) {
    if (!operation) {
      const existing = await findOperation(operationId);
      if (existing) {
        operation = await finishOperation(operationId, {
          status: "FAILED",
          processedCount,
          createdCount,
          pendingCount,
          failureCount: 1,
          message: readableError(error),
        });
      }
    }
    throw error;
  }

  return {
    operation: requireRow(operation),
    processedCount,
    createdCount,
    pendingCount,
    skippedWithoutPositiveBalance,
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
  const [latestImport, latestProcessing] = await Promise.all([
    findLatestOperation("CDI_IMPORT"),
    findLatestOperation("ACCOUNT_REMUNERATION"),
  ]);
  const counts = await query<{ active: number; pending: number }>(
    `select
       count(*) filter (where c."enabled")::int as "active",
       count(*) filter (
         where c."enabled" and not exists (
           select 1 from "FinancialIndexRate" r
            where r."kind" = c."indexKind" and r."status" = 'CONFIRMED'
              and r."referenceOn" >= c."startsOn"
         )
       )::int as "pending"
       from "AccountRemunerationConfiguration" c`,
  );

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
    activeConfigurations: counts[0]?.active ?? 0,
    pendingConfigurations: counts[0]?.pending ?? 0,
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
): Promise<void> {
  const transactionId = randomUUID();
  const competenceOn = toDateOnly(candidate.referenceOn);
  const description = buildRemunerationDescription(candidate, calculation, competenceOn);
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

  await executeQuery(
    `insert into "AccountRemuneration"
      ("id", "organizationId", "financialProfileId", "accountId", "financialIndexRateId",
       "transactionId", "indexKind", "competenceOn", "processedOn", "balanceBaseMinor",
       "dailyRatePercent", "remunerationPercent", "appliedDailyRatePercent",
       "originalAmountMinor", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
    [
      randomUUID(),
      candidate.organizationId,
      candidate.financialProfileId,
      candidate.accountId,
      candidate.id,
      transactionId,
      CDI_KIND,
      competenceOn,
      processedOn,
      calculation.balanceMinor,
      calculation.dailyRatePercent,
      calculation.remunerationPercent,
      calculation.appliedDailyRatePercent,
      calculation.amountMinor,
      now,
    ],
  );
}

function buildRemunerationDescription(
  candidate: CandidateRow,
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

async function countPendingConfigurations(
  executeQuery: ExecuteQuery,
  processedOn: string,
): Promise<number> {
  const rows = await executeQuery<{ count: number }>(
    `select count(*)::int as "count"
       from "AccountRemunerationConfiguration" c
      where c."enabled" = true
        and not exists (
          select 1 from "FinancialIndexRate" r
           where r."kind" = c."indexKind"
             and r."status" = 'CONFIRMED'
             and r."referenceOn" >= c."startsOn"
             and r."referenceOn" < $1::date
        )`,
    [processedOn],
  );

  return rows[0]?.count ?? 0;
}

async function createOperation(
  id: string,
  kind: string,
  executeQuery: ExecuteQuery = query,
): Promise<void> {
  await executeQuery(
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

async function findOperation(id: string): Promise<OperationRecord | undefined> {
  const rows = await query<OperationRow>(
    `select "id", "kind", "status", "startedAt", "completedAt", "importedCount",
            "processedCount", "createdCount", "pendingCount", "failureCount", "message"
       from "FinancialIndexOperation" where "id" = $1`,
    [id],
  );

  return rows[0] ? mapOperationRow(rows[0]) : undefined;
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

function mapConfigurationRow(
  row: ConfigurationRow,
  context: TenantContext,
): AccountRemunerationConfigurationRecord {
  const record: AccountRemunerationConfigurationRecord = {
    id: row.id || `${context.financialProfileId}:${row.accountId}`,
    accountId: row.accountId,
    accountName: row.accountName,
    accountCurrency: row.accountCurrency,
    enabled: row.enabled ?? false,
    indexKind: "cdi",
    updatedAt: row.updatedAt?.toISOString() ?? new Date(0).toISOString(),
  };

  if (row.remunerationPercent !== null) {
    record.remunerationPercent = Number(row.remunerationPercent);
  }
  if (row.startsOn !== null) record.startsOn = toDateOnly(row.startsOn);
  if (row.categoryId !== null) record.categoryId = row.categoryId;

  return record;
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

function buildBcbSgsCdiUrl(startsOn: string, endsOn: string): string {
  const endpoint = new URL(process.env.BCB_SGS_CDI_URL ?? DEFAULT_BCB_SGS_CDI_URL);
  endpoint.searchParams.set("formato", "json");
  endpoint.searchParams.set("dataInicial", formatBrazilianDate(startsOn));
  endpoint.searchParams.set("dataFinal", formatBrazilianDate(endsOn));
  return endpoint.toString();
}

function formatBrazilianDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeOptionalPercentage(value: number | undefined): number | undefined {
  return value === undefined ? undefined : validateRemunerationPercentage(value);
}

function normalizeOptionalDate(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : normalizeDate(value);
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

function normalizeOptionalId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
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
    throw repositoryError("DATABASE_RESULT_MISSING", "A operação não retornou o registro esperado.", 500);
  }
  return row;
}

function repositoryError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
