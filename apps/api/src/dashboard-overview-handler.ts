import type { TenantContext } from "@solverfin/domain";
import { financialTodayInSaoPaulo } from "@solverfin/shared";

import { json } from "./router-request-helpers.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import {
  buildDashboardOverview,
  validateDashboardPurchaseDate,
} from "./repositories/dashboard-overview.js";

export async function dashboardOverviewHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const now = new Date();
  const today = financialTodayInSaoPaulo(now);
  const purchaseOn = validateDashboardPurchaseDate(request.query.get("purchaseOn"), today);
  if (!purchaseOn)
    return json(400, {
      code: "DASHBOARD_PURCHASE_DATE_INVALID",
      message: "Escolha uma data de hoje até 365 dias no futuro.",
    });
  return json(200, await buildDashboardOverview(context, purchaseOn, now));
}
