import { financialInstitutionCatalog, type FinancialInstitutionCatalogItem } from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import type { UploadedInstitutionLogo } from "../institution-logo-upload.js";

export type FinancialInstitutionStatus = "active" | "inactive";
export type InstitutionLogoStatus = "local_asset" | "r2_asset" | "fallback";
export type MissingInstitutionField = "bankCode" | "ispb" | "logo";

export interface FinancialInstitutionRecord {
  key: string;
  label: string;
  description: string;
  fallbackLabel: string;
  status: FinancialInstitutionStatus;
  financialInstitutionCode: string;
  bankCode?: string;
  ispb?: string;
  institutionType?: string;
  logoAssetPath?: string;
  logoObjectKey?: string;
  logoPublicUrl?: string;
  logoMimeType?: string;
  logoSizeBytes?: number;
  logoContentSha256?: string;
  logoUploadedAt?: string;
  logoStatus: InstitutionLogoStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListFinancialInstitutionsFilters {
  q?: string;
  status?: "active" | "inactive" | "all";
  logoStatus?: InstitutionLogoStatus | "all";
  bankCode?: string;
  ispb?: string;
  institutionType?: string;
  missing?: MissingInstitutionField;
  page?: number;
  pageSize?: number;
  sort?: "label" | "key" | "bankCode" | "ispb" | "status" | "updatedAt";
  order?: "asc" | "desc";
}

export interface ListFinancialInstitutionsResult {
  institutions: FinancialInstitutionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface FinancialInstitutionRow {
  key: string;
  label: string;
  description: string | null;
  fallbackLabel: string;
  status: string;
  financialInstitutionCode: string | null;
  bankCode: string | null;
  ispb: string | null;
  institutionType: string | null;
  logoAssetPath: string | null;
  logoObjectKey: string | null;
  logoPublicUrl: string | null;
  logoMimeType: string | null;
  logoSizeBytes: number | null;
  logoContentSha256: string | null;
  logoUploadedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;
const memoryInstitutions = new Map<string, FinancialInstitutionRecord>();

const verifiedBankCodes: Readonly<Record<string, string>> = {
  banco_do_brasil: "001",
  banco_pan: "623",
  bradesco: "237",
  btg_pactual: "208",
  c6: "336",
  caixa: "104",
  inter: "077",
  itau: "341",
  original: "212",
  safra: "422",
  santander: "033",
};

const defaultInstitutionTypes: Readonly<Record<string, string>> = {
  mercado_pago: "payment_institution",
  pagbank: "payment_institution",
  picpay: "digital_wallet",
  sicredi: "cooperative",
  sicoob: "cooperative",
  solverfin_demo: "demo",
};

export async function listFinancialInstitutions(
  filters: ListFinancialInstitutionsFilters = {},
): Promise<ListFinancialInstitutionsResult> {
  const institutions = await readPersistedInstitutions();
  const filtered = institutions.filter((institution) => matchesFilters(institution, filters));
  const sorted = sortInstitutions(filtered, filters);
  const page = clampPositiveInteger(filters.page, DEFAULT_PAGE);
  const pageSize = Math.min(clampPositiveInteger(filters.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const start = (page - 1) * pageSize;

  return {
    institutions: sorted.slice(start, start + pageSize),
    total: sorted.length,
    page,
    pageSize,
  };
}

export async function findFinancialInstitution(
  institutionKey: string,
): Promise<FinancialInstitutionRecord | undefined> {
  try {
    const rows = await query<FinancialInstitutionRow>(
      `select "key", "label", "description", "fallbackLabel", "status",
              "financialInstitutionCode", "bankCode", "ispb", "institutionType",
              "logoAssetPath", "logoObjectKey", "logoPublicUrl", "logoMimeType",
              "logoSizeBytes", "logoContentSha256", "logoUploadedAt", "createdAt", "updatedAt"
         from "FinancialInstitution"
        where "key" = $1
        limit 1`,
      [institutionKey],
    );

    return rows[0] ? mapFinancialInstitutionRow(rows[0]) : undefined;
  } catch (error) {
    if (!canUseMemoryFallback(error)) throw error;

    return getMemoryInstitutions().get(institutionKey);
  }
}

export async function refreshFinancialInstitutionsFromDefaults(): Promise<number> {
  const defaults = financialInstitutionCatalog.map(toDefaultInstitutionRecord);

  try {
    await withTransaction(async (executeQuery) => {
      for (const institution of defaults) {
        await executeQuery(
          `insert into "FinancialInstitution"
            ("key", "label", "description", "fallbackLabel", "status", "financialInstitutionCode",
             "bankCode", "ispb", "institutionType", "logoAssetPath")
           values ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8, $9)
           on conflict ("key") do update set
             "label" = excluded."label",
             "description" = excluded."description",
             "fallbackLabel" = excluded."fallbackLabel",
             "financialInstitutionCode" = coalesce("FinancialInstitution"."financialInstitutionCode", excluded."financialInstitutionCode"),
             "bankCode" = coalesce("FinancialInstitution"."bankCode", excluded."bankCode"),
             "ispb" = coalesce("FinancialInstitution"."ispb", excluded."ispb"),
             "institutionType" = coalesce("FinancialInstitution"."institutionType", excluded."institutionType"),
             "logoAssetPath" = coalesce("FinancialInstitution"."logoAssetPath", excluded."logoAssetPath"),
             "updatedAt" = now()`,
          [
            institution.key,
            institution.label,
            institution.description,
            institution.fallbackLabel,
            institution.financialInstitutionCode,
            institution.bankCode ?? null,
            institution.ispb ?? null,
            institution.institutionType ?? null,
            institution.logoAssetPath ?? null,
          ],
        );
      }
    });
  } catch (error) {
    if (!canUseMemoryFallback(error)) throw error;

    refreshMemoryInstitutions(defaults);
  }

  return defaults.length;
}

export async function updateFinancialInstitutionStatus(
  institutionKey: string,
  status: FinancialInstitutionStatus,
): Promise<FinancialInstitutionRecord | undefined> {
  try {
    const rows = await query<FinancialInstitutionRow>(
      `update "FinancialInstitution"
          set "status" = $2, "updatedAt" = now()
        where "key" = $1
        returning "key", "label", "description", "fallbackLabel", "status",
                  "financialInstitutionCode", "bankCode", "ispb", "institutionType",
                  "logoAssetPath", "logoObjectKey", "logoPublicUrl", "logoMimeType",
                  "logoSizeBytes", "logoContentSha256", "logoUploadedAt", "createdAt", "updatedAt"`,
      [institutionKey, status.toUpperCase()],
    );

    return rows[0] ? mapFinancialInstitutionRow(rows[0]) : undefined;
  } catch (error) {
    if (!canUseMemoryFallback(error)) throw error;

    const institution = getMemoryInstitutions().get(institutionKey);

    if (!institution) return undefined;

    const updated = { ...institution, status, updatedAt: new Date().toISOString() };
    memoryInstitutions.set(institutionKey, updated);

    return updated;
  }
}

export async function persistFinancialInstitutionLogo(
  institutionKey: string,
  logo: UploadedInstitutionLogo,
): Promise<void> {
  try {
    await query(
      `update "FinancialInstitution"
          set "logoObjectKey" = $2,
              "logoPublicUrl" = $3,
              "logoMimeType" = $4,
              "logoSizeBytes" = $5,
              "logoContentSha256" = $6,
              "logoUploadedAt" = $7,
              "updatedAt" = now()
        where "key" = $1`,
      [
        institutionKey,
        logo.objectKey,
        logo.publicUrl,
        logo.mimeType,
        logo.sizeBytes,
        logo.contentSha256,
        logo.uploadedAt,
      ],
    );
  } catch (error) {
    if (!canUseMemoryFallback(error)) throw error;

    const institution = getMemoryInstitutions().get(institutionKey);

    if (!institution) return;

    memoryInstitutions.set(institutionKey, {
      ...institution,
      logoAssetPath: logo.publicUrl,
      logoObjectKey: logo.objectKey,
      logoPublicUrl: logo.publicUrl,
      logoMimeType: logo.mimeType,
      logoSizeBytes: logo.sizeBytes,
      logoContentSha256: logo.contentSha256,
      logoUploadedAt: logo.uploadedAt,
      logoStatus: "r2_asset",
      updatedAt: logo.uploadedAt,
    });
  }
}

async function readPersistedInstitutions(): Promise<FinancialInstitutionRecord[]> {
  try {
    const rows = await query<FinancialInstitutionRow>(
      `select "key", "label", "description", "fallbackLabel", "status",
              "financialInstitutionCode", "bankCode", "ispb", "institutionType",
              "logoAssetPath", "logoObjectKey", "logoPublicUrl", "logoMimeType",
              "logoSizeBytes", "logoContentSha256", "logoUploadedAt", "createdAt", "updatedAt"
         from "FinancialInstitution"`,
    );

    return rows.map(mapFinancialInstitutionRow);
  } catch (error) {
    if (!canUseMemoryFallback(error)) throw error;

    return Array.from(getMemoryInstitutions().values());
  }
}

export function toDefaultInstitutionRecord(
  institution: FinancialInstitutionCatalogItem,
): FinancialInstitutionRecord {
  const extendedInstitution = institution as FinancialInstitutionCatalogItem & {
    institutionType?: string;
  };
  const bankCode = institution.bankCode ?? verifiedBankCodes[institution.key];
  const institutionType =
    extendedInstitution.institutionType ?? defaultInstitutionTypes[institution.key] ?? "bank";

  return {
    key: institution.key,
    label: institution.label,
    description: institution.description,
    fallbackLabel: institution.fallbackLabel,
    status: institution.status,
    financialInstitutionCode: institution.financialInstitutionCode,
    ...(bankCode ? { bankCode } : {}),
    ...(institution.ispb ? { ispb: institution.ispb } : {}),
    institutionType,
    ...(institution.logoAssetPath ? { logoAssetPath: institution.logoAssetPath } : {}),
    logoStatus: institution.logoAssetPath ? "local_asset" : "fallback",
  };
}

function mapFinancialInstitutionRow(row: FinancialInstitutionRow): FinancialInstitutionRecord {
  const logoAssetPath = row.logoPublicUrl ?? row.logoAssetPath ?? undefined;

  return {
    key: row.key,
    label: row.label,
    description: row.description ?? "",
    fallbackLabel: row.fallbackLabel,
    status: row.status.toLowerCase() as FinancialInstitutionStatus,
    financialInstitutionCode: row.financialInstitutionCode ?? row.key,
    ...(row.bankCode ? { bankCode: row.bankCode } : {}),
    ...(row.ispb ? { ispb: row.ispb } : {}),
    ...(row.institutionType ? { institutionType: row.institutionType } : {}),
    ...(logoAssetPath ? { logoAssetPath } : {}),
    ...(row.logoObjectKey ? { logoObjectKey: row.logoObjectKey } : {}),
    ...(row.logoPublicUrl ? { logoPublicUrl: row.logoPublicUrl } : {}),
    ...(row.logoMimeType ? { logoMimeType: row.logoMimeType } : {}),
    ...(row.logoSizeBytes !== null ? { logoSizeBytes: row.logoSizeBytes } : {}),
    ...(row.logoContentSha256 ? { logoContentSha256: row.logoContentSha256 } : {}),
    ...(row.logoUploadedAt ? { logoUploadedAt: row.logoUploadedAt.toISOString() } : {}),
    logoStatus: row.logoObjectKey ? "r2_asset" : row.logoAssetPath ? "local_asset" : "fallback",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function matchesFilters(
  institution: FinancialInstitutionRecord,
  filters: ListFinancialInstitutionsFilters,
): boolean {
  if (filters.status && filters.status !== "all" && institution.status !== filters.status) {
    return false;
  }

  if (
    filters.logoStatus &&
    filters.logoStatus !== "all" &&
    institution.logoStatus !== filters.logoStatus
  ) {
    return false;
  }

  if (filters.bankCode && institution.bankCode !== filters.bankCode.trim()) {
    return false;
  }

  if (
    filters.ispb &&
    !normalizeSearchText(institution.ispb ?? "").includes(normalizeSearchText(filters.ispb))
  ) {
    return false;
  }

  if (filters.institutionType && institution.institutionType !== filters.institutionType) {
    return false;
  }

  if (filters.missing === "bankCode" && institution.bankCode) return false;
  if (filters.missing === "ispb" && institution.ispb) return false;
  if (filters.missing === "logo" && institution.logoStatus !== "fallback") return false;

  if (filters.q) {
    const term = normalizeSearchText(filters.q);
    const haystack = normalizeSearchText(
      [
        institution.label,
        institution.key,
        institution.financialInstitutionCode,
        institution.bankCode ?? "",
        institution.ispb ?? "",
      ].join(" "),
    );

    if (!haystack.includes(term)) {
      return false;
    }
  }

  return true;
}

function sortInstitutions(
  institutions: FinancialInstitutionRecord[],
  filters: ListFinancialInstitutionsFilters,
): FinancialInstitutionRecord[] {
  const sort = filters.sort ?? "label";
  const direction = filters.order === "desc" ? -1 : 1;

  return [...institutions].sort((first, second) => {
    const firstValue = String(first[sort] ?? "");
    const secondValue = String(second[sort] ?? "");

    return firstValue.localeCompare(secondValue, "pt-BR") * direction;
  });
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}

function getMemoryInstitutions(): Map<string, FinancialInstitutionRecord> {
  if (memoryInstitutions.size === 0) {
    refreshMemoryInstitutions(financialInstitutionCatalog.map(toDefaultInstitutionRecord));
  }

  return memoryInstitutions;
}

function refreshMemoryInstitutions(defaults: FinancialInstitutionRecord[]): void {
  for (const institution of defaults) {
    const current = memoryInstitutions.get(institution.key);

    memoryInstitutions.set(institution.key, {
      ...institution,
      status: current?.status ?? institution.status,
      ...(current?.logoObjectKey
        ? {
            logoAssetPath: current.logoPublicUrl ?? current.logoAssetPath,
            logoObjectKey: current.logoObjectKey,
            logoPublicUrl: current.logoPublicUrl,
            logoMimeType: current.logoMimeType,
            logoSizeBytes: current.logoSizeBytes,
            logoContentSha256: current.logoContentSha256,
            logoUploadedAt: current.logoUploadedAt,
            logoStatus: "r2_asset",
          }
        : {}),
    });
  }
}

function canUseMemoryFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("DATABASE_URL is required") ||
    message.includes("relation \"FinancialInstitution\" does not exist")
  );
}
