import { withSharedTransaction } from "../db.js";
import {
  getFinancialIndexStatus as getBaseFinancialIndexStatus,
  importCdiRates as importBaseCdiRates,
  processAccountRemunerations as processBaseAccountRemunerations,
  type ImportCdiRatesInput,
  type ImportCdiRatesResult as BaseImportCdiRatesResult,
  type ProcessAccountRemunerationsResult as BaseProcessAccountRemunerationsResult,
} from "./account-remuneration-service.js";
import {
  formatImportOutcomeMessage,
  formatProcessingOutcomeMessage,
} from "./account-remuneration-diagnostics-messages.js";
import {
  attachDiagnostics,
  findLatestCdiReferenceDate,
  persistCurrentFailedDiagnostics,
  persistOperationDiagnostics,
  readProcessingSnapshot,
  readProviderPeriod,
  recordRolledBackOperation,
} from "./account-remuneration-diagnostics-persistence.js";
import {
  assertProcessingDiagnosticRelations,
  classifyImportOutcome,
  type FinancialIndexStatusRecord,
  type ImportCdiRatesResult,
  type ImportOperationDiagnostics,
  type ProcessAccountRemunerationsResult,
  type ProcessingOperationDiagnostics,
  type RolledBackOperation,
  type TransactionResult,
} from "./account-remuneration-diagnostics-types.js";

export {
  assertProcessingDiagnosticRelations,
  classifyImportOutcome,
  formatImportOutcomeMessage,
  formatProcessingOutcomeMessage,
};
export type {
  FinancialIndexStatusRecord,
  ImportCdiRatesResult,
  ImportOperationDiagnostics,
  ProcessAccountRemunerationsResult,
  ProcessingOperationDiagnostics,
} from "./account-remuneration-diagnostics-types.js";

const DEFAULT_IMPORT_LOOKBACK_DAYS = 10;

export async function importCdiRates(
  input: ImportCdiRatesInput = {},
  fetcher: typeof fetch = fetch,
): Promise<ImportCdiRatesResult> {
  const endsOn = normalizeDate(input.endsOn ?? today());
  const requestedStartsOn = normalizeDate(
    input.startsOn ?? addDays(endsOn, -DEFAULT_IMPORT_LOOKBACK_DAYS),
  );
  assertImportPeriodOrder(requestedStartsOn, endsOn);
  const requestedPeriod = { startsOn: requestedStartsOn, endsOn };
  let rolledBackOperation: RolledBackOperation | undefined;

  let transactionResult: TransactionResult<ImportCdiRatesResult>;
  try {
    transactionResult = await withSharedTransaction(async (executeQuery) => {
      let providerConsulted = false;
      let effectivePeriod: ImportOperationDiagnostics["effectivePeriod"] = null;
      const observedFetcher: typeof fetch = async (resource, init) => {
        providerConsulted = true;
        effectivePeriod = readProviderPeriod(resource);
        return fetcher(resource, init);
      };

      let result: BaseImportCdiRatesResult;
      try {
        result = await importBaseCdiRates(input, observedFetcher);
      } catch (error) {
        const diagnostics: ImportOperationDiagnostics = {
          kind: "CDI_IMPORT",
          outcome: "FAILED",
          requestedPeriod,
          effectivePeriod,
          providerConsulted,
          receivedCount: 0,
          importedCount: 0,
        };
        await persistCurrentFailedDiagnostics(
          "CDI_IMPORT",
          diagnostics,
          executeQuery,
        );
        return { ok: false, error };
      }

      const outcome = classifyImportOutcome({
        providerConsulted,
        receivedCount: result.receivedCount,
        importedCount: result.importedCount,
      });
      const diagnostics: ImportOperationDiagnostics = {
        kind: "CDI_IMPORT",
        outcome,
        requestedPeriod,
        effectivePeriod,
        providerConsulted,
        receivedCount: result.receivedCount,
        importedCount: result.importedCount,
      };
      const latestReferenceOn = await findLatestCdiReferenceDate(executeQuery);
      const message = formatImportOutcomeMessage(
        diagnostics,
        latestReferenceOn,
      );
      rolledBackOperation = {
        id: result.operation.id,
        kind: "CDI_IMPORT",
        message:
          "A atualização do CDI foi desfeita porque não foi possível persistir o diagnóstico operacional.",
        diagnostics,
      };
      const operation = await persistOperationDiagnostics(
        result.operation,
        diagnostics,
        message,
        executeQuery,
      );

      return {
        ok: true,
        value: { ...result, operation, outcome, diagnostics },
      };
    });
  } catch (error) {
    if (rolledBackOperation) {
      await recordRolledBackOperation(rolledBackOperation);
    }
    throw error;
  }

  rolledBackOperation = undefined;
  if (!transactionResult.ok) throw transactionResult.error;
  return transactionResult.value;
}

export async function processAccountRemunerations(
  processedOn = today(),
): Promise<ProcessAccountRemunerationsResult> {
  const normalizedProcessedOn = normalizeDate(processedOn);
  let rolledBackOperation: RolledBackOperation | undefined;

  let transactionResult: TransactionResult<ProcessAccountRemunerationsResult>;
  try {
    transactionResult = await withSharedTransaction(async (executeQuery) => {
      let result: BaseProcessAccountRemunerationsResult;
      try {
        result = await processBaseAccountRemunerations(normalizedProcessedOn);
      } catch (error) {
        const snapshot = await readProcessingSnapshot(
          normalizedProcessedOn,
          executeQuery,
        );
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
        await persistCurrentFailedDiagnostics(
          "ACCOUNT_REMUNERATION",
          diagnostics,
          executeQuery,
        );
        return { ok: false, error };
      }

      rolledBackOperation = {
        id: result.operation.id,
        kind: "ACCOUNT_REMUNERATION",
        message:
          "O processamento foi desfeito porque não foi possível persistir o diagnóstico operacional.",
        diagnostics: null,
      };
      const snapshot = await readProcessingSnapshot(
        normalizedProcessedOn,
        executeQuery,
      );
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
        eligibleCompetences:
          alreadyRegisteredCompetences + result.processedCount,
        alreadyRegisteredCompetences,
        processedCompetences: result.processedCount,
        plannedTransactionsCreated: result.createdCount,
        nonPositiveBalanceCompetences: result.skippedWithoutPositiveBalance,
        zeroAmountCompetences: result.skippedZeroAmount,
        pendingCompetences: result.pendingCount,
      };
      rolledBackOperation.diagnostics = diagnostics;
      assertProcessingDiagnosticRelations(diagnostics);
      const message = formatProcessingOutcomeMessage(diagnostics);
      const operation = await persistOperationDiagnostics(
        result.operation,
        diagnostics,
        message,
        executeQuery,
      );

      return {
        ok: true,
        value: { ...result, operation, diagnostics },
      };
    });
  } catch (error) {
    if (rolledBackOperation) {
      await recordRolledBackOperation(rolledBackOperation);
    }
    throw error;
  }

  rolledBackOperation = undefined;
  if (!transactionResult.ok) throw transactionResult.error;
  return transactionResult.value;
}

export async function getFinancialIndexStatus(): Promise<FinancialIndexStatusRecord> {
  const status = await getBaseFinancialIndexStatus();
  const [latestImport, latestProcessing] = await Promise.all([
    attachDiagnostics(status.latestImport),
    attachDiagnostics(status.latestProcessing),
  ]);

  return { ...status, latestImport, latestProcessing };
}

function assertImportPeriodOrder(startsOn: string, endsOn: string): void {
  if (startsOn <= endsOn) return;

  throw Object.assign(
    new Error("A data inicial não pode ser posterior à data final."),
    {
      code: "FINANCIAL_INDEX_PERIOD_INVALID",
      statusCode: 400,
    },
  );
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
