import {
  TenantAuthorizationError,
  TenantError,
  type CardInstrumentHolder,
  type CardInstrumentStatus,
  type CardInstrumentType,
  type CardStatus,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  archiveCardInstrumentForContext,
  archiveCreditCardAccountForContext,
  createCardInstrumentForContext,
  createCreditCardAccountForContext,
  deleteCreditCardAccountForContext,
  getCreditCardAccountForContext,
  listCardInstrumentsForContext,
  listCreditCardAccountsForContext,
  setDefaultCardInstrumentForContext,
  updateCardInstrumentForContext,
  updateCreditCardAccountForContext,
} from "./repositories/card-instruments.js";
import { registerCardPurchaseForContext } from "./repositories/cards.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type CreditCardAccountHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface CreditCardAccountRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: CreditCardAccountHandler;
}

const ACCOUNTS_BASE_PATH = "/api/credit-card-accounts";
const INSTRUMENTS_BASE_PATH = "/api/credit-card-instruments";
const routes: CreditCardAccountRoute[] = [];

route("GET", ACCOUNTS_BASE_PATH, listCreditCardAccountsHandler);
route("POST", ACCOUNTS_BASE_PATH, createCreditCardAccountHandler);
route("GET", `${ACCOUNTS_BASE_PATH}/:cardId`, getCreditCardAccountHandler);
route("PATCH", `${ACCOUNTS_BASE_PATH}/:cardId`, updateCreditCardAccountHandler);
route("DELETE", `${ACCOUNTS_BASE_PATH}/:cardId`, deleteCreditCardAccountHandler);
route("POST", `${ACCOUNTS_BASE_PATH}/:cardId/archive`, archiveCreditCardAccountHandler);
route("GET", `${ACCOUNTS_BASE_PATH}/:cardId/instruments`, listCardInstrumentsHandler);
route("POST", `${ACCOUNTS_BASE_PATH}/:cardId/instruments`, createCardInstrumentHandler);
route("PATCH", `${ACCOUNTS_BASE_PATH}/:cardId/default-instrument`, setDefaultCardInstrumentHandler);
route("POST", `${ACCOUNTS_BASE_PATH}/:cardId/purchases`, registerCardPurchaseHandler);
route("PATCH", `${INSTRUMENTS_BASE_PATH}/:instrumentId`, updateCardInstrumentHandler);
route("POST", `${INSTRUMENTS_BASE_PATH}/:instrumentId/archive`, archiveCardInstrumentHandler);

export async function handleCreditCardAccountsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (
    !request.pathname.startsWith(ACCOUNTS_BASE_PATH) &&
    !request.pathname.startsWith(INSTRUMENTS_BASE_PATH)
  ) {
    return undefined;
  }

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

function route(method: string, path: string, handler: CreditCardAccountHandler): void {
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
  });
}

function findRoute(
  method: string,
  pathname: string,
): { route: CreditCardAccountRoute; params: Record<string, string> } | undefined {
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

async function listCreditCardAccountsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as CardStatus | "all" | null;

  return json(200, {
    creditCardAccounts: await listCreditCardAccountsForContext(context, status ? { status } : {}),
  });
}

async function createCreditCardAccountHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const creditCardAccount = await createCreditCardAccountForContext(context, {
    name: String(body.name ?? ""),
    closingDay: Number(body.closingDay),
    dueDay: Number(body.dueDay),
    instruments: readInstruments(body.instruments),
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

  return json(201, { creditCardAccount });
}

async function getCreditCardAccountHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    creditCardAccount: await getCreditCardAccountForContext(context, requireParam(match, "cardId")),
  });
}

async function updateCreditCardAccountHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const creditCardAccount = await updateCreditCardAccountForContext(
    context,
    requireParam(match, "cardId"),
    {
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
    },
  );

  return json(200, { creditCardAccount });
}

async function archiveCreditCardAccountHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    creditCardAccount: await archiveCreditCardAccountForContext(
      context,
      requireParam(match, "cardId"),
    ),
  });
}

async function deleteCreditCardAccountHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const cardId = requireParam(match, "cardId");

  await deleteCreditCardAccountForContext(context, cardId);

  return json(200, { creditCardAccountId: cardId });
}

async function listCardInstrumentsHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    instruments: await listCardInstrumentsForContext(context, requireParam(match, "cardId")),
  });
}

async function createCardInstrumentHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const creditCardAccount = await createCardInstrumentForContext(
    context,
    requireParam(match, "cardId"),
    readInstrument(body),
  );

  return json(201, { creditCardAccount });
}

async function registerCardPurchaseHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const result = await registerCardPurchaseForContext(
    context,
    requireParam(match, "cardId"),
    {
      occurredOn: String(body.occurredOn ?? ""),
      amountMinor: Number(body.amountMinor),
      description: String(body.description ?? ""),
      ...(body.cardInstrumentId !== undefined
        ? { cardInstrumentId: String(body.cardInstrumentId) }
        : {}),
      ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
      ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
      ...(body.totalInstallments !== undefined
        ? { totalInstallments: Number(body.totalInstallments) }
        : {}),
      ...(body.installmentStart !== undefined
        ? { installmentStart: Number(body.installmentStart) }
        : {}),
    },
    { requireInstrumentContext: true },
  );

  return json(201, result);
}

async function updateCardInstrumentHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const creditCardAccount = await updateCardInstrumentForContext(
    context,
    requireParam(match, "instrumentId"),
    {
      ...(body.type !== undefined ? { type: body.type as CardInstrumentType } : {}),
      ...(body.holder !== undefined ? { holder: body.holder as CardInstrumentHolder } : {}),
      ...(body.status !== undefined ? { status: body.status as CardInstrumentStatus } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault === true } : {}),
      ...(body.name !== undefined ? { name: readOptionalString(body.name) } : {}),
      ...(body.maskedIdentifier !== undefined
        ? { maskedIdentifier: readOptionalString(body.maskedIdentifier) }
        : {}),
      ...(body.creditLimitMinor !== undefined
        ? { creditLimitMinor: readOptionalNumber(body.creditLimitMinor) }
        : {}),
    },
  );

  return json(200, { creditCardAccount });
}

async function archiveCardInstrumentHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    creditCardAccount: await archiveCardInstrumentForContext(
      context,
      requireParam(match, "instrumentId"),
    ),
  });
}

async function setDefaultCardInstrumentHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const creditCardAccount = await setDefaultCardInstrumentForContext(
    context,
    requireParam(match, "cardId"),
    String(body.instrumentId ?? ""),
  );

  return json(200, { creditCardAccount });
}

function readInstruments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => readInstrument(requireObjectBody(item)));
}

function readInstrument(body: Record<string, unknown>) {
  return {
    type: body.type as CardInstrumentType,
    holder: body.holder as CardInstrumentHolder,
    ...(body.status !== undefined ? { status: body.status as CardInstrumentStatus } : {}),
    ...(body.isDefault !== undefined ? { isDefault: body.isDefault === true } : {}),
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.maskedIdentifier !== undefined
      ? { maskedIdentifier: String(body.maskedIdentifier) }
      : {}),
    ...(body.creditLimitMinor !== undefined
      ? { creditLimitMinor: Number(body.creditLimitMinor) }
      : {}),
  };
}

function readOptionalString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return String(value);
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  return Number(value);
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function requireParam(match: Readonly<Record<string, string>>, key: string): string {
  const value = match[key];

  if (!value) {
    throw new AuthError("AUTH_SESSION_REQUIRED", `Missing required path parameter: ${key}.`, 400);
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

function buildAuthHeaders(authorization: string | undefined): { authorization?: string } {
  return authorization === undefined ? {} : { authorization };
}

function mapDomainError(error: unknown): unknown {
  if (
    error instanceof AuthError ||
    error instanceof TenantAuthorizationError ||
    error instanceof TenantError
  ) {
    return error;
  }

  return error;
}
