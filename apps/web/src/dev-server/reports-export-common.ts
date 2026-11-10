import type { ExportTable } from "./reports-export-serializers.js";

export class ReportExportError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReportExportError";
  }
}

export function asSourceError(error: string, status?: number): never {
  throw new ReportExportError(
    status && status >= 400 && status <= 599 ? status : 502,
    "REPORT_EXPORT_SOURCE_UNAVAILABLE",
    error,
  );
}

export function selectedTables(tables: readonly ExportTable[], currency: string): ExportTable[] {
  return tables.length
    ? [...tables]
    : [
        {
          name: "sem-dados",
          currency: currency === "all" ? "" : currency,
          columns: ["estado"],
          rows: [],
        },
      ];
}
