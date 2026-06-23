import {
  TenantAuthorizationError,
  TenantError,
  type AccountKind,
  type AccountStatus,
  type BudgetStatus,
  type CardStatus,
  type CategoryKind,
  type CategoryStatus,
  type InvoiceStatus,
  type RecurrenceFrequency,
  type RecurrenceStatus,
  type TenantContext,
  type TransactionKind,
  type TransactionStatus,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  archiveAccountForContext,
  createAccountForContext,
  getAccountForContext,
  listAccountsForContext,
  updateAccountForContext,
} from "./repositories/accounts.js";
import {
  closeInvoiceForContext,
  listCardPurchasesForContext,
  summarizeInvoiceForContext,
  type PurchaseReconciliationFilter,
} from "./repositories/card-invoice-contracts.js";
import {
  archiveCategoryForContext,
  createCategoryForContext,
  getCategoryForContext,
  listCategoriesForContext,
  restoreCategoryForContext,
  updateCategoryForContext,
} from "./repositories/categories.js";
import {
  archiveCardForContext,
  blockCardForContext,
  createCardForContext,
  getCardForContext,
  getInvoiceForContext,
  listCardsForContext,
  listInvoicesForContext,
  payInvoiceForContext,
  registerCardPurchaseForContext,
  updateCardForContext,
} from "./repositories/cards.js";
import {
  archiveBudgetForContext,
  createBudgetForContext,
  getBudgetForContext,
  listBudgetsForContext,
  summarizeBudgetUsageForContext,
  updateBudgetForContext,
} from "./repositories/budgets.js";
import { buildFinancialSummary } from "./repositories/dashboard.js";
import {
  cancelRecurrenceForContext,
  createRecurrenceForContext,
  generateInstallmentsForContext,
  getRecurrenceForContext,
  listRecurrencesForContext,
  pauseRecurrenceForContext,
  resumeRecurrenceForContext,
  updateRecurrenceForContext,
} from "./repositories/recurrences.js";
import {
  createTransactionForContext,
  getTransactionForContext,
  listTransactionsForContext,
  updateTransactionForContext,
  voidTransactionForContext,
} from "./repositories/transactions.js";
import { loadFinancialProfilesForUser, resolveRequestTenantContext } from "./tenant-context.js";

export interface ApiRequest {
  method: string;
  pathname: string;
  query: URLSearchParams;
  headers: Readonly<Record<string, string | undefined>>;
  body: unknown;
}

export interface ApiResponse {
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
}

type RouteHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: RouteHandler;
  requiresAuth: boolean;
}

const routes: Route[] = [];

route("GET", "/api/financial-profiles", listProfilesHandler);
route("GET", "/api/financial-summary", financialSummaryHandler);

route("GET", "/api/accounts", listAccountsHandler);
route("POST", "/api/accounts", createAccountHandler);
route("GET", "/api/accounts/:accountId", getAccountHandler);
route("PATCH", "/api/accounts/:accountId", updateAccountHandler);
route("POST", "/api/accounts/:accountId/archive", archiveAccountHandler);

route("GET", "/api/categories", listCategoriesHandler);
route("POST", "/api/categories", createCategoryHandler);
route("GET", "/api/categories/:categoryId", getCategoryHandler);
route("PATCH", "/api/categories/:categoryId", updateCategoryHandler);
route("POST", "/api/categories/:categoryId/archive", archiveCategoryHandler);
route("POST", "/api/categories/:categoryId/restore", restoreCategoryHandler);

route("GET", "/api/transactions", listTransactionsHandler);
route("POST", "/api/transactions", createTransactionHandler);
route("GET", "/api/transactions/:transactionId", getTransactionHandler);
route("PATCH", "/api/transactions/:transactionId", updateTransactionHandler);
route("POST", "/api/transactions/:transactionId/void", voidTransactionHandler);

route("GET", "/api/recurrences", listRecurrencesHandler);
route("POST", "/api/recurrences", createRecurrenceHandler);
route("GET", "/api/recurrences/:recurrenceId", getRecurrenceHandler);
route("PATCH", "/api/recurrences/:recurrenceId", updateRecurrenceHandler);
route("POST", "/api/recurrences/:recurrenceId/pause", pauseRecurrenceHandler);
route("POST", "/api/recurrences/:recurrenceId/resume", resumeRecurrenceHandler);
route("POST", "/api/recurrences/:recurrenceId/cancel", cancelRecurrenceHandler);
route("POST", "/api/recurrences/:recurrenceId/generate-installments", generateInstallmentsHandler);

route("GET", "/api/card-purchases", listCardPurchasesHandler);
route("GET", "/api/cards", listCardsHandler);
route("POST", "/api/cards", createCardHandler);
route("GET", "/api/cards/:cardId", getCardHandler);
route("PATCH", "/api/cards/:cardId", updateCardHandler);
route("POST", "/api/cards/:cardId/archive", archiveCardHandler);
route("POST", "/api/cards/:cardId/block", blockCardHandler);
route("POST", "/api/cards/:cardId/purchases", registerCardPurchaseHandler);

route("GET", "/api/invoices", listInvoicesHandler);
route("GET", "/api/invoices/:invoiceId", getInvoiceHandler);
route("GET", "/api/invoices/:invoiceId/summary", getInvoiceSummaryHandler);
route("GET", "/api/invoices/:invoiceId/purchases", listInvoicePurchasesHandler);
route("POST", "/api/invoices/:invoiceId/close", closeInvoiceHandler);
route("POST", "/api/invoices/:invoiceId/pay", payInvoiceHandler);

route("GET", "/api/budgets", listBudgetsHandler);
route("POST", "/api/budgets", createBudgetHandler);
route("GET", "/api/budgets/:budgetId", getBudgetHandler);
route("PATCH", "/api/budgets/:budgetId", updateBudgetHandler);
route("POST", "/api/budgets/:budgetId/archive", archiveBudgetHandler);
route("GET", "/api/budgets/:budgetId/usage", getBudgetUsageHandler);

export async function handleApiRequest(request: ApiRequest): Promise<ApiResponse | undefined> {
  const correlationId = resolveCorrelationId(request.headers);
  const match = findRoute(request.method, request.pathname);

  if (!match) {
    return undefined;
  }

  try {
    const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );

    return await match.route.handler(request, context, match.params);
  } catch (error) {
    const response = buildApiErrorResponse({
      error: mapDomainError(error),
      correlationId,
    });

    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

function route(method: string, path: string, handler: RouteHandler, requiresAuth = true): void {
  const paramNames: string[] = [];
  const patternSource = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));

        return "([^/]+)";
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  routes.push({
    method,
    pattern: new RegExp(`^${patternSource}$`),
    paramNames,
    handler,
    requiresAuth,
  });
}

function findRoute(
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | undefined {
  for (const candidate of routes) {
    if (candidate.method !== method) {
      continue;
    }

    const result = candidate.pattern.exec(pathname);

    if (!result) {
      continue;
    }

    const params: Record<string, string> = {};

    candidate.paramNames.forEach((name, index) => {
      const value = result[index + 1];

      if (value !== undefined) {
        params[name] = value;
      }
    });

    return { route: candidate, params };
  }

  return undefined;
}

async function listProfilesHandler(request: ApiRequest): Promise<ApiResponse> {
  const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
  const profiles = await loadFinancialProfilesForUser(user.id);

  return json(200, {
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      status: profile.status,
    })),
  });
}

async function financialSummaryHandler(
  _request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  return json(200, await buildFinancialSummary(context));
}

async function listAccountsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as AccountStatus | "all" | null;
  const accounts = await listAccountsForContext(context, status ? { status } : {});

  return json(200, { accounts });
}

async function createAccountHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const account = await createAccountForContext(context, {
    name: String(body.name ?? ""),
    kind: body.kind as AccountKind,
    ...(body.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: Number(body.openingBalanceMinor) }
      : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.maskedIdentifier !== undefined
      ? { maskedIdentifier: String(body.maskedIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
  });

  return json(201, { account });
}

async function getAccountHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const account = await getAccountForContext(context, requireParam(match, "accountId"));

  return json(200, { account });
}

async function updateAccountHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const account = await updateAccountForContext(context, requireParam(match, "accountId"), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.kind !== undefined ? { kind: body.kind as AccountKind } : {}),
    ...(body.status !== undefined ? { status: body.status as AccountStatus } : {}),
    ...(body.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: Number(body.openingBalanceMinor) }
      : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.maskedIdentifier !== undefined
      ? { maskedIdentifier: String(body.maskedIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
  });

  return json(200, { account });
}

async function archiveAccountHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const account = await archiveAccountForContext(context, requireParam(match, "accountId"));

  return json(200, { account });
}

async function listCategoriesHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as CategoryStatus | "all" | null;
  const kind = request.query.get("kind") as CategoryKind | null;
  const categories = await listCategoriesForContext(context, {
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
  });

  return json(200, { categories });
}

async function createCategoryHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const category = await createCategoryForContext(context, {
    name: String(body.name ?? ""),
    kind: body.kind as CategoryKind,
    ...(body.parentCategoryId !== undefined
      ? { parentCategoryId: String(body.parentCategoryId) }
      : {}),
  });

  return json(201, { category });
}

async function getCategoryHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const category = await getCategoryForContext(context, requireParam(match, "categoryId"));

  return json(200, { category });
}

async function updateCategoryHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const category = await updateCategoryForContext(context, requireParam(match, "categoryId"), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.kind !== undefined ? { kind: body.kind as CategoryKind } : {}),
    ...(body.status !== undefined ? { status: body.status as CategoryStatus } : {}),
    ...(body.parentCategoryId !== undefined
      ? { parentCategoryId: String(body.parentCategoryId) }
      : {}),
  });

  return json(200, { category });
}

async function archiveCategoryHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const category = await archiveCategoryForContext(context, requireParam(match, "categoryId"));

  return json(200, { category });
}

async function restoreCategoryHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const category = await restoreCategoryForContext(context, requireParam(match, "categoryId"));

  return json(200, { category });
}

async function listTransactionsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as TransactionStatus | "all" | null;
  const kind = request.query.get("kind") as TransactionKind | null;
  const accountId = request.query.get("accountId");
  const categoryId = request.query.get("categoryId");
  const occurredFrom = request.query.get("occurredFrom");
  const occurredTo = request.query.get("occurredTo");
  const plannedFrom = request.query.get("plannedFrom");
  const plannedTo = request.query.get("plannedTo");
  const effectiveFrom = request.query.get("effectiveFrom");
  const effectiveTo = request.query.get("effectiveTo");
  const transactions = await listTransactionsForContext(context, {
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(occurredFrom ? { occurredFrom } : {}),
    ...(occurredTo ? { occurredTo } : {}),
    ...(plannedFrom ? { plannedFrom } : {}),
    ...(plannedTo ? { plannedTo } : {}),
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveTo ? { effectiveTo } : {}),
  });

  return json(200, { transactions });
}

async function createTransactionHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const transaction = await createTransactionForContext(context, {
    kind: body.kind as TransactionKind,
    amountMinor: Number(body.amountMinor),
    occurredOn: String(body.occurredOn ?? body.effectiveOn ?? body.plannedOn ?? ""),
    accountId: String(body.accountId ?? ""),
    ...(body.plannedOn !== undefined ? { plannedOn: String(body.plannedOn) } : {}),
    ...(body.effectiveOn !== undefined ? { effectiveOn: readOptionalDate(body.effectiveOn) } : {}),
    ...(body.description !== undefined ? { description: String(body.description) } : {}),
    ...(body.status !== undefined ? { status: body.status as TransactionStatus } : {}),
    ...(body.destinationAccountId !== undefined
      ? { destinationAccountId: String(body.destinationAccountId) }
      : {}),
    ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
  });

  return json(201, { transaction });
}

async function getTransactionHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const transaction = await getTransactionForContext(context, requireParam(match, "transactionId"));

  return json(200, { transaction });
}

async function updateTransactionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const transaction = await updateTransactionForContext(
    context,
    requireParam(match, "transactionId"),
    {
      ...(body.kind !== undefined ? { kind: body.kind as TransactionKind } : {}),
      ...(body.status !== undefined ? { status: body.status as TransactionStatus } : {}),
      ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
      ...(body.occurredOn !== undefined ? { occurredOn: String(body.occurredOn) } : {}),
      ...(body.plannedOn !== undefined ? { plannedOn: String(body.plannedOn) } : {}),
      ...(body.effectiveOn !== undefined
        ? { effectiveOn: readOptionalDate(body.effectiveOn) }
        : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
      ...(body.destinationAccountId !== undefined
        ? { destinationAccountId: String(body.destinationAccountId) }
        : {}),
      ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
      ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    },
  );

  return json(200, { transaction });
}

async function voidTransactionHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const transaction = await voidTransactionForContext(
    context,
    requireParam(match, "transactionId"),
  );

  return json(200, { transaction });
}

function buildAuthHeaders(authorization: string | undefined): { authorization?: string } {
  return authorization === undefined ? {} : { authorization };
}

async function listRecurrencesHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as RecurrenceStatus | "all" | null;
  const accountId = request.query.get("accountId");
  const categoryId = request.query.get("categoryId");
  const recurrences = await listRecurrencesForContext(context, {
    ...(status ? { status } : {}),
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
  });

  return json(200, { recurrences });
}

async function createRecurrenceHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const recurrence = await createRecurrenceForContext(context, {
    frequency: body.frequency as RecurrenceFrequency,
    startOn: String(body.startOn ?? ""),
    amountMinor: Number(body.amountMinor),
    description: String(body.description ?? ""),
    accountId: String(body.accountId ?? ""),
    ...(body.endOn !== undefined ? { endOn: String(body.endOn) } : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
  });

  return json(201, { recurrence });
}

async function getRecurrenceHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const recurrence = await getRecurrenceForContext(context, requireParam(match, "recurrenceId"));

  return json(200, { recurrence });
}

async function updateRecurrenceHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const recurrence = await updateRecurrenceForContext(
    context,
    requireParam(match, "recurrenceId"),
    {
      ...(body.frequency !== undefined ? { frequency: body.frequency as RecurrenceFrequency } : {}),
      ...(body.startOn !== undefined ? { startOn: String(body.startOn) } : {}),
      ...(body.endOn !== undefined ? { endOn: String(body.endOn) } : {}),
      ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
      ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
      ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
    },
  );

  return json(200, { recurrence });
}

async function pauseRecurrenceHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    recurrence: await pauseRecurrenceForContext(context, requireParam(match, "recurrenceId")),
  });
}

async function resumeRecurrenceHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    recurrence: await resumeRecurrenceForContext(context, requireParam(match, "recurrenceId")),
  });
}

async function cancelRecurrenceHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    recurrence: await cancelRecurrenceForContext(context, requireParam(match, "recurrenceId")),
  });
}

async function generateInstallmentsHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body =
    typeof request.body === "object" && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {};
  const through = body.through !== undefined ? String(body.through) : defaultGenerationWindow();
  const maxOccurrences =
    body.maxOccurrences !== undefined ? Number(body.maxOccurrences) : undefined;
  const installments = await generateInstallmentsForContext(
    context,
    requireParam(match, "recurrenceId"),
    through,
    maxOccurrences,
  );

  return json(201, { installments });
}

function defaultGenerationWindow(): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 12);

  return date.toISOString().slice(0, 10);
}

async function listCardPurchasesHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const purchases = await listCardPurchasesForContext(context, readCardPurchaseFilters(request));

  return json(200, { purchases });
}

async function listCardsHandler(request: ApiRequest, context: TenantContext): Promise<ApiResponse> {
  const status = request.query.get("status") as CardStatus | "all" | null;

  return json(200, { cards: await listCardsForContext(context, status ? { status } : {}) });
}

async function createCardHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const card = await createCardForContext(context, {
    name: String(body.name ?? ""),
    closingDay: Number(body.closingDay),
    dueDay: Number(body.dueDay),
    ...(body.creditLimitMinor !== undefined
      ? { creditLimitMinor: Number(body.creditLimitMinor) }
      : {}),
    ...(body.maskedIdentifier !== undefined
      ? { maskedIdentifier: String(body.maskedIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
    ...(body.brandKey !== undefined ? { brandKey: String(body.brandKey) } : {}),
    ...(body.paymentAccountId !== undefined
      ? { paymentAccountId: String(body.paymentAccountId) }
      : {}),
  });

  return json(201, { card });
}

async function getCardHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, { card: await getCardForContext(context, requireParam(match, "cardId")) });
}

async function updateCardHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const card = await updateCardForContext(context, requireParam(match, "cardId"), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.status !== undefined ? { status: body.status as CardStatus } : {}),
    ...(body.closingDay !== undefined ? { closingDay: Number(body.closingDay) } : {}),
    ...(body.dueDay !== undefined ? { dueDay: Number(body.dueDay) } : {}),
    ...(body.creditLimitMinor !== undefined
      ? { creditLimitMinor: Number(body.creditLimitMinor) }
      : {}),
    ...(body.maskedIdentifier !== undefined
      ? { maskedIdentifier: String(body.maskedIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
    ...(body.brandKey !== undefined ? { brandKey: String(body.brandKey) } : {}),
    ...(body.paymentAccountId !== undefined
      ? { paymentAccountId: String(body.paymentAccountId) }
      : {}),
  });

  return json(200, { card });
}

async function archiveCardHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, { card: await archiveCardForContext(context, requireParam(match, "cardId")) });
}

async function blockCardHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, { card: await blockCardForContext(context, requireParam(match, "cardId")) });
}

async function registerCardPurchaseHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const result = await registerCardPurchaseForContext(context, requireParam(match, "cardId"), {
    occurredOn: String(body.occurredOn ?? ""),
    amountMinor: Number(body.amountMinor),
    description: String(body.description ?? ""),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
    ...(body.totalInstallments !== undefined
      ? { totalInstallments: Number(body.totalInstallments) }
      : {}),
  });

  return json(201, result);
}

async function listInvoicesHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as InvoiceStatus | "all" | null;
  const cardId = request.query.get("cardId");

  return json(200, {
    invoices: await listInvoicesForContext(context, {
      ...(status ? { status } : {}),
      ...(cardId ? { cardId } : {}),
    }),
  });
}

async function getInvoiceHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    invoice: await getInvoiceForContext(context, requireParam(match, "invoiceId")),
  });
}

async function getInvoiceSummaryHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    summary: await summarizeInvoiceForContext(context, requireParam(match, "invoiceId")),
  });
}

async function listInvoicePurchasesHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const purchases = await listCardPurchasesForContext(context, {
    ...readCardPurchaseFilters(request),
    invoiceId: requireParam(match, "invoiceId"),
  });

  return json(200, { purchases });
}

async function closeInvoiceHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    summary: await closeInvoiceForContext(context, requireParam(match, "invoiceId")),
  });
}

async function payInvoiceHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const result = await payInvoiceForContext(
    context,
    requireParam(match, "invoiceId"),
    String(body.paymentAccountId ?? ""),
    {
      paidOn: String(body.paidOn ?? ""),
      ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
    },
  );

  return json(200, result);
}

async function listBudgetsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as BudgetStatus | "all" | null;
  const categoryId = request.query.get("categoryId");

  return json(200, {
    budgets: await listBudgetsForContext(context, {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
    }),
  });
}

async function createBudgetHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const budget = await createBudgetForContext(context, {
    categoryId: String(body.categoryId ?? ""),
    periodStartOn: String(body.periodStartOn ?? ""),
    plannedAmountMinor: Number(body.plannedAmountMinor),
    ...(body.periodEndOn !== undefined ? { periodEndOn: String(body.periodEndOn) } : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.alertThresholdPercent !== undefined
      ? { alertThresholdPercent: Number(body.alertThresholdPercent) }
      : {}),
  });

  return json(201, { budget });
}

async function getBudgetHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, { budget: await getBudgetForContext(context, requireParam(match, "budgetId")) });
}

async function updateBudgetHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const budget = await updateBudgetForContext(context, requireParam(match, "budgetId"), {
    ...(body.status !== undefined ? { status: body.status as BudgetStatus } : {}),
    ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
    ...(body.periodStartOn !== undefined ? { periodStartOn: String(body.periodStartOn) } : {}),
    ...(body.periodEndOn !== undefined ? { periodEndOn: String(body.periodEndOn) } : {}),
    ...(body.plannedAmountMinor !== undefined
      ? { plannedAmountMinor: Number(body.plannedAmountMinor) }
      : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.alertThresholdPercent !== undefined
      ? { alertThresholdPercent: Number(body.alertThresholdPercent) }
      : {}),
  });

  return json(200, { budget });
}

async function archiveBudgetHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    budget: await archiveBudgetForContext(context, requireParam(match, "budgetId")),
  });
}

async function getBudgetUsageHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const usage = await summarizeBudgetUsageForContext(context, requireParam(match, "budgetId"));

  return json(200, { usage });
}

function readCardPurchaseFilters(request: ApiRequest) {
  const reconciliation = readReconciliationFilter(request.query.get("reconciliation"));

  return {
    ...(request.query.get("invoiceId")
      ? { invoiceId: String(request.query.get("invoiceId")) }
      : {}),
    ...(request.query.get("cardId") ? { cardId: String(request.query.get("cardId")) } : {}),
    ...(request.query.get("occurredFrom")
      ? { occurredFrom: String(request.query.get("occurredFrom")) }
      : {}),
    ...(request.query.get("occurredTo")
      ? { occurredTo: String(request.query.get("occurredTo")) }
      : {}),
    ...(reconciliation ? { reconciliation } : {}),
    ...(request.query.get("search") ? { search: String(request.query.get("search")) } : {}),
  };
}

function readReconciliationFilter(value: string | null): PurchaseReconciliationFilter | undefined {
  if (value === "all" || value === "reconciled" || value === "unreconciled") {
    return value;
  }

  return undefined;
}

function readOptionalDate(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  const text = String(value);

  return text.trim() ? text : null;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];

  if (!value) {
    throw new AuthError("AUTH_SESSION_REQUIRED", `Missing required path parameter: ${name}.`, 400);
  }

  return value;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

function mapDomainError(error: unknown): unknown {
  if (error instanceof TenantError) {
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;

    return { code: error.code, statusCode, message: error.message };
  }

  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  return error;
}
