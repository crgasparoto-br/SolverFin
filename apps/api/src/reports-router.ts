import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import {
  buildCategoryEvolutionReportForContext,
  parseCategoryEvolutionFilters,
  type CategoryEvolutionPeriod,
  type CategoryEvolutionReport,
} from "./category-evolution-report.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const CATEGORY_EVOLUTION_PATH = "/api/reports/category-evolution";
const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export async function handleReportsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (
    request.pathname !== CATEGORY_EVOLUTION_PATH ||
    request.method !== "GET"
  ) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest({
      authorization: request.headers.authorization,
    });
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );
    const filters = parseCategoryEvolutionFilters(request.query);
    const report = normalizeCategoryEvolutionPeriodLabels(
      await buildCategoryEvolutionReportForContext(context, filters),
    );

    return json(200, { report });
  } catch (error) {
    const response = buildApiErrorResponse({
      error: mapDomainError(error),
      correlationId,
    });
    return json(response.statusCode, response.body);
  }
}

export function normalizeCategoryEvolutionPeriodLabels(
  report: CategoryEvolutionReport,
): CategoryEvolutionReport {
  if (report.interval === "annual") return report;

  return {
    ...report,
    periods: report.periods.map((period) => ({
      ...period,
      label:
        report.interval === "monthly"
          ? compactMonth(period.startsOn)
          : `${compactMonth(period.startsOn)}–${compactMonth(period.endsOn)}`,
    })),
  };
}

function compactMonth(periodDate: CategoryEvolutionPeriod["startsOn"]): string {
  const year = periodDate.slice(0, 4);
  const month = Number(periodDate.slice(5, 7));
  const monthLabel = MONTH_LABELS[month - 1];
  if (!monthLabel) return periodDate.slice(0, 7);
  return `${monthLabel}/${year.slice(-2)}`;
}

function mapDomainError(error: unknown): unknown {
  if (error instanceof TenantError) {
    return {
      code: error.code,
      statusCode: error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403,
      message: error.message,
    };
  }
  if (error instanceof TenantAuthorizationError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  return error;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}
