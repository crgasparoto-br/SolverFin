import type {
  FinancialIndexStatusRecord as BaseFinancialIndexStatusRecord,
  ImportCdiRatesResult as BaseImportCdiRatesResult,
  OperationRecord,
  ProcessAccountRemunerationsResult as BaseProcessAccountRemunerationsResult,
} from "./account-remuneration-service.js";

export type ImportOutcome =
  | "IMPORTED"
  | "ALREADY_UP_TO_DATE"
  | "PROVIDER_NO_RATES"
  | "NO_NEW_RECORDS"
  | "FAILED";

export interface DatePeriod {
  startsOn: string;
  endsOn: string;
}

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

export interface RolledBackOperation {
  id: string;
  kind: OperationDiagnostics["kind"];
  message: string;
  diagnostics: OperationDiagnostics | null;
}

export type TransactionResult<TResult> =
  | { ok: true; value: TResult }
  | { ok: false; error: unknown };

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
