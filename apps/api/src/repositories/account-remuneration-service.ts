import { query } from "../db.js";
import {
  getFinancialIndexStatus as getFinancialIndexStatusV2,
  listAccountRemunerationConfigurations,
  processAccountRemunerations,
  saveAccountRemunerationConfiguration,
  type AccountRemunerationConfigurationRecord,
  type FinancialIndexStatusRecord as FinancialIndexStatusRecordV2,
  type ProcessAccountRemunerationsResult,
  type SaveAccountRemunerationConfigurationInput,
} from "./account-remuneration-v2.js";
import {
  importCdiRates as importCdiRatesBase,
  type ImportCdiRatesResult,
  type OperationRecord,
} from "./account-remuneration.js";

export {
  listAccountRemunerationConfigurations,
  processAccountRemunerations,
  saveAccountRemunerationConfiguration,
};
export type {
  AccountRemunerationConfigurationRecord,
  OperationRecord,
  ProcessAccountRemunerationsResult,
  SaveAccountRemunerationConfigurationInput,
};

export interface ImportCdiRatesInput {
  startsOn?: string;
  endsOn?: string;
}

export interface FinancialIndexStatusRecord extends FinancialIndexStatusRecordV2 {
  pendingConfigurations: number;
}

export async function importCdiRates(
  input: ImportCdiRatesInput = {},
  fetcher: typeof fetch = fetch,
): Promise<ImportCdiRatesResult> {
  const endsOn = normalizeDate(input.endsOn ?? today());
  const latest = await findLatestCdiReferenceDate();
  const startsOn = latest
    ? addDays(latest, 1)
    : normalizeDate(input.startsOn ?? addDays(endsOn, -10));

  if (startsOn > endsOn) {
    return importCdiRatesBase({ startsOn: endsOn, endsOn }, fetcher);
  }

  return importCdiRatesBase({ startsOn, endsOn }, fetcher);
}

export async function getFinancialIndexStatus(): Promise<FinancialIndexStatusRecord> {
  const status = await getFinancialIndexStatusV2();

  return {
    ...status,
    pendingConfigurations: status.pendingCompetences + status.configurationsWithoutRates,
  };
}

async function findLatestCdiReferenceDate(): Promise<string | undefined> {
  const rows = await query<{ referenceOn: Date }>(
    `select "referenceOn"
       from "FinancialIndexRate"
      where "kind" = 'CDI' and "status" = 'CONFIRMED'
      order by "referenceOn" desc
      limit 1`,
  );

  return rows[0] ? rows[0].referenceOn.toISOString().slice(0, 10) : undefined;
}

function normalizeDate(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw serviceError("DATE_INVALID", "Informe uma data válida no formato AAAA-MM-DD.");
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw serviceError("DATE_INVALID", "Informe uma data válida.");
  }

  return normalized;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function serviceError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
