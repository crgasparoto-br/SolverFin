import { query } from "../db.js";
import {
  getFinancialIndexStatus as getBaseFinancialIndexStatus,
  importCdiRates as importBaseCdiRates,
  processAccountRemunerations as processBaseAccountRemunerations,
  type FinancialIndexStatusRecord as BaseFinancialIndexStatusRecord,
  type ImportCdiRatesInput,
  type ImportCdiRatesResult as BaseImportCdiRatesResult,
  type OperationRecord,
  type ProcessAccountRemunerationsResult as BaseProcessAccountRemunerationsResult,
} from "./account-remuneration-service.js";

export type ImportOutcome =
  | "IMPORTED"
  | "ALREADY_UP_TO_DATE"
  | "PROVIDER_NO_RATES"
  | "NO_NEW_RECORDS"
  | "FAILED";

export interface ImportOperationDiagnostics {
  kind: "CDI_IMPORT";
  outcome: ImportOutcome;
  requestedPeriod: DatePeriod;
  effectivePeriod: DatePeriod | null;
  providerConsulted: boolean;
  receivedCount: number;
  importedCount: number;
}

export interface ProcessingOperationDiagnostics {
  kind: "ACCOUNT_REMUNERATION";
  processedOn: string;
  activeConfigurations: number;
  notEligibleConfigurations: number;
  configurationsWithoutRates: number;
  eligibleCompetences: number;
  alreadyRegisteredCompetences: number;
  processedCompetences: number;
  plannedTransactionsCreated: number;
  nonPositiveBalanceCompetences: number;
  zeroAmountCompetences: number;
  pendingCompetences: number;
}

export type OperationDiagnostics =
  | ImportOperationDiagnostics
  | ProcessingOperationDiagnostics;

export type DiagnosedOperationRecord = OperationRecord & {
  diagnostics: OperationDiagnostics | null;
};

export interface ImportCdiRatesResult extends BaseImportCdiRatesResult {
  operation: DiagnosedOperationRecord;
  outcome: ImportOutcome;
  diagnostics: ImportOperationDiagnostics;
}

export interface ProcessAccountRemunerationsResult
  extends BaseProcessAccountRemunerationsResult {
  operation: DiagnosedOperationRecord;
  diagnostics: ProcessingOperationDiagnostics;
}

export type FinancialIndexStatusRecord = Omit<
  BaseFinancialIndexStatusRecord,
  "latestImport" | "latestProcessing"
> & {
  latestImport: DiagnosedOperationRecord | null;
  latestProcessing: DiagnosedOperationRecord | null;
};

interface DatePeriod {
  startsOn: string;
  endsOn: string;
}

interface ProcessingSnapshotRow {
  activeConfigurations: number;
  notEligibleConfigurations: number;
  configurationsWithoutRates: number;
  alreadyRegisteredCompetences: number;
}

interface DiagnosticsRow {
  diagnostics: unknown;
}

const CDI_KIND = "CDI";
const DEFAULT_IMPORT_LOOKBACK_DAYS = 10;

export async function importCdiRates(
  input: ImportCdiRatesInput = {},
  fetcher: typeof fetch = fetch,
): Promise<ImportCdiRatesResult> {
  const endsOn = normalizeDate(input.endsOn ?? today());
  const requestedStartsOn = normalizeDate(
    input.startsOn ?? addDays(endsOn, -DEFAULT_IMPORT_LOOKBACK_DAYS),
  );
  const latestReferenceOn = await findLatestCdiReferenceDate();
  const effectiveStartsOn = latestReferenceOn
    ? addDays(latestReferenceOn, 1)
    : requestedStartsOn;
  const effectivePeriod =
    effectiveStartsOn <= endsOn
      ? { startsOn: effectiveStartsOn, endsOn }
      : null;
  const providerConsulted = effectivePeriod !== null;
  const startedAt = new Date();

  try {
    const result = await importBaseCdiRates(input, fetcher);
    const outcome = classifyImportOutcome({
      providerConsulted,
      receivedCount: result.receivedCount,
      importedCount: result.importedCount,
    });
    const diagnostics: ImportOperationDiagnostics = {
      kind: "CDI_IMPORT",
      outcome,
      requestedPeriod: { startsOn: requestedStartsOn, endsOn },
      effectivePeriod,
      providerConsulted,
      receivedCount: result.receivedCount,
      importedCount: result.importedCount,
    };
    const message = formatImportOutcomeMessage(diagnostics, latestReferenceOn);
    const operation = await persistOperationDiagnostics(
      result.operation,
      diagnostics,
      message,
    );

    return { ...result, operation, outcome, diagnostics };
  } catch (error) {
    const diagnostics: ImportOperationDiagnostics = {
      kind: "CDI_IMPORT",
      outcome: "FAILED",
      requestedPeriod: { startsOn: requestedStartsOn, endsOn },
      effectivePeriod,
      providerConsulted,
      receivedCount: 0,
      importedCount: 0,
    };
    await persistLatestFailedDiagnostics("CDI_IMPORT", startedAt, diagnostics);
    throw error;
  }
}

export async function processAccountRemunerations(
  processedOn = today(),
): Promise<ProcessAccountRemunerationsResult> {
  const normalizedProcessedOn = normalizeDate(processedOn);
  const startedAt = new Date();

  try {
    const result = await processBaseAccountRemunerations(normalizedProcessedOn);
    const snapshot = await readProcessingSnapshot(normalizedProcessedOn);
    const alreadyRegisteredCompetences = Math.max(
      0,
      snapshot.alreadyRegisteredCompetences - result.processedCount,
    );
    const diagnostics: ProcessingOperationDiagnostics = {
      kind: "ACCOUNT_REMUNERATION",
      processedOn: normalizedProcessedOn,
      activeConfigurations: snapshot.activeConfigurations,
      notEligibleConfigurations: snapshot.notEligibleConfigurations,
      configurationsWithoutRates: snapshot.configurationsWithoutRates,
      eligibleCompetences: alreadyRegisteredCompetences + result.processedCount,
      alreadyRegisteredCompetences,
      processedCompetences: result.processedCount,
      plannedTransactionsCreated: result.createdCount,
      nonPositiveBalanceCompetences: result.skippedWithoutPositiveBalance,
      zeroAmountCompetences: result.skippedZeroAmount,
      pendingCompetences: result.pendingCount,
    };
    assertProcessingDiagnosticRelations(diagnostics);
    const message = formatProcessingOutcomeMessage(diagnostics);
    const operation = await persistOperationDiagnostics(
      result.operation,
      diagnostics,
      message,
    );

    return { ...result, operation, diagnostics };
  } catch (error) {
    const snapshot = await readProcessingSnapshot(normalizedProcessedOn);
    const diagnostics: ProcessingOperationDiagnostics = {
      kind: "ACCOUNT_REMUNERATION",
      processedOn: normalizedProcessedOn,
      activeConfigurations: snapshot.activeConfigurations,
      notEligibleConfigurations: snapshot.notEligibleConfigurations,
      configurationsWithoutRates: snapshot.configurationsWithoutRates,
      eligibleCompetences: snapshot.alreadyRegisteredCompetences,
      alreadyRegisteredCompetences: snapshot.alreadyRegisteredCompetences,
      processedCompetences: 0,
      plannedTransactionsCreated: 0,
      nonPositiveBalanceCompetences: 0,
      zeroAmountCompetences: 0,
      pendingCompetences: 0,
    };
    await persistLatestFailedDiagnostics(
      "ACCOUNT_REMUNERATION",
      startedAt,
      diagnostics,
    );
    throw error;
  }
}

export async function getFinancialIndexStatus(): Promise<FinancialIndexStatusRecord> {
  const status = await getBaseFinancialIndexStatus();
  const [latestImport, latestProcessing] = await Promise.all([
    attachDiagnostics(status.latestImport),
    attachDiagnostics(status.latestProcessing),
  ]);

  return { ...status, latestImport, latestProcessing };
}

export function classifyImportOutcome(input: {
  providerConsulted: boolean;
  receivedCount: number;
  importedCount: number;
}): Exclude<ImportOutcome, "FAILED"> {
  if (!input.providerConsulted) return "ALREADY_UP_TO_DATE";
  if (input.receivedCount === 0) return "PROVIDER_NO_RATES";
  if (input.importedCount === 0) return "NO_NEW_RECORDS";
  return "IMPORTED";
}

export function assertProcessingDiagnosticRelations(
  diagnostics: ProcessingOperationDiagnostics,
): void {
  const selected =
    diagnostics.alreadyRegisteredCompetences + diagnostics.processedCompetences;
  if (diagnostics.eligibleCompetences !== selected) {
    throw new Error(
      "Diagnóstico inconsistente: competências elegíveis devem ser a soma das já registradas e processadas.",
    );
  }

  const completed =
    diagnostics.plannedTransactionsCreated +
    diagnostics.nonPositiveBalanceCompetences +
    diagnostics.zeroAmountCompetences;
  if (diagnostics.processedCompetences !== completed) {
    throw new Error(
      "Diagnóstico inconsistente: competências processadas devem corresponder aos resultados concluídos.",
    );
  }
}

export function formatImportOutcomeMessage(
  diagnostics: ImportOperationDiagnostics,
  latestReferenceOn: string | null,
): string {
  const requestedPeriod = formatPeriod(diagnostics.requestedPeriod);
  const effectivePeriod = diagnostics.effectivePeriod
    ? formatPeriod(diagnostics.effectivePeriod)
    : requestedPeriod;

  switch (diagnostics.outcome) {
    case "IMPORTED":
      return `O Banco Central foi consultado no período ${effectivePeriod}, retornou ${diagnostics.receivedCount} taxa(s) e ${diagnostics.importedCount} nova(s) taxa(s) CDI foram importada(s).`;
    case "ALREADY_UP_TO_DATE":
      return `A série CDI já estava atualizada${latestReferenceOn ? ` até ${formatDate(latestReferenceOn)}` : ""} para o período solicitado ${requestedPeriod}. O Banco Central não foi consultado e nenhum registro novo foi criado.`;
    case "PROVIDER_NO_RATES":
      return `O Banco Central foi consultado no período ${effectivePeriod} e não retornou taxas. Nenhum registro novo foi criado; isso pode ocorrer em fins de semana ou feriados.`;
    case "NO_NEW_RECORDS":
      return `O Banco Central retornou ${diagnostics.receivedCount} taxa(s) no período ${effectivePeriod}, mas todas já estavam armazenadas. Nenhum registro novo foi criado.`;
    case "FAILED":
      return `A atualização do CDI falhou para o período solicitado ${requestedPeriod}. Consulte a mensagem de erro registrada na operação.`;
  }
}

export function formatProcessingOutcomeMessage(
  diagnostics: ProcessingOperationDiagnostics,
): string {
  if (diagnostics.processedCompetences === 0) {
    return `Nenhuma competência nova foi processada em ${formatDate(diagnostics.processedOn)}. Há ${diagnostics.activeConfigurations} configuração(ões) ativa(s): ${diagnostics.notEligibleConfigurations} ainda não iniciada(s), ${diagnostics.configurationsWithoutRates} sem taxa CDI disponível e ${diagnostics.alreadyRegisteredCompetences} competência(s) elegível(is) já registrada(s). Nenhuma receita prevista foi criada.`;
  }

  return `Foram processadas ${diagnostics.processedCompetences} competência(s) em ${formatDate(diagnostics.processedOn)}: ${diagnostics.plannedTransactionsCreated} receita(s) prevista(s) criada(s), ${diagnostics.nonPositiveBalanceCompetences} concluída(s) sem lançamento por saldo não positivo e ${diagnostics.zeroAmountCompetences} por arredondamento para zero. Restam ${diagnostics.pendingCompetences} competência(s) pendente(s).`;
}

async function readProcessingSnapshot(
  processedOn: string,
): Promise<ProcessingSnapshotRow> {
  const rows = await query<ProcessingSnapshotRow>(
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
  if (!row)
    throw new Error(
      "Não foi possível calcular o diagnóstico do processamento CDI.",
    );
  return row;
}

async function findLatestCdiReferenceDate(): Promise<string | null> {
  const rows = await query<{ referenceOn: Date }>(
    `select "referenceOn"
       from "FinancialIndexRate"
      where "kind" = $1 and "status" = 'CONFIRMED'
      order by "referenceOn" desc
      limit 1`,
    [CDI_KIND],
  );

  return rows[0] ? toDateOnly(rows[0].referenceOn) : null;
}

async function persistOperationDiagnostics<
  TDiagnostics extends OperationDiagnostics,
>(
  operation: OperationRecord,
  diagnostics: TDiagnostics,
  message: string,
): Promise<DiagnosedOperationRecord> {
  await query(
    `update "FinancialIndexOperation"
        set "diagnostics" = $2::jsonb,
            "message" = $3,
            "updatedAt" = now()
      where "id" = $1`,
    [operation.id, JSON.stringify(diagnostics), message],
  );

  return { ...operation, message, diagnostics };
}

async function persistLatestFailedDiagnostics(
  kind: OperationDiagnostics["kind"],
  startedAt: Date,
  diagnostics: OperationDiagnostics,
): Promise<void> {
  await query(
    `update "FinancialIndexOperation"
        set "diagnostics" = $3::jsonb,
            "updatedAt" = now()
      where "id" = (
        select "id"
          from "FinancialIndexOperation"
         where "kind" = $1
           and "status" = 'FAILED'
           and "startedAt" >= $2::timestamptz - interval '5 minutes'
         order by "startedAt" desc
         limit 1
      )`,
    [kind, startedAt, JSON.stringify(diagnostics)],
  );
}

async function attachDiagnostics(
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

function parseDiagnostics(value: unknown): OperationDiagnostics | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("kind" in value)) return null;
  const kind = (value as { kind?: unknown }).kind;
  if (kind !== "CDI_IMPORT" && kind !== "ACCOUNT_REMUNERATION") return null;
  return value as OperationDiagnostics;
}

function normalizeDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(
      new Error("Informe uma data válida no formato AAAA-MM-DD."),
      {
        code: "FINANCIAL_INDEX_PERIOD_INVALID",
        statusCode: 400,
      },
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw Object.assign(
      new Error("Informe uma data válida no formato AAAA-MM-DD."),
      {
        code: "FINANCIAL_INDEX_PERIOD_INVALID",
        statusCode: 400,
      },
    );
  }

  return value;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatPeriod(period: DatePeriod): string {
  return `${formatDate(period.startsOn)} a ${formatDate(period.endsOn)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
