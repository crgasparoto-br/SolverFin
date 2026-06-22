import { TenantAuthorizationError, TenantError, type TenantContext } from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { query, withTransaction } from "./db.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type CardAdditionalLinksHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface CardAdditionalLinksRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: CardAdditionalLinksHandler;
}

interface CardAdditionalLinkRow {
  organizationId: string;
  financialProfileId: string;
  groupCardId: string;
  cardId: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BASE_PATH = "/api/card-additional-links";
const routes: CardAdditionalLinksRoute[] = [];

route("GET", BASE_PATH, listCardAdditionalLinksHandler);
route("POST", BASE_PATH, linkAdditionalCardHandler);
route("PATCH", `${BASE_PATH}/:groupCardId/primary`, setPrimaryCardHandler);

export async function handleCardAdditionalLinksApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);
  const match = findRoute(request.method, request.pathname);

  if (!match) {
    return undefined;
  }

  try {
    const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
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

function route(method: string, path: string, handler: CardAdditionalLinksHandler): void {
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
): { route: CardAdditionalLinksRoute; params: Record<string, string> } | undefined {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;

    const result = candidate.pattern.exec(pathname);
    if (!result) continue;

    const params: Record<string, string> = {};
    candidate.paramNames.forEach((name, index) => {
      const value = result[index + 1];
      if (value !== undefined) params[name] = value;
    });

    return { route: candidate, params };
  }

  return undefined;
}

async function listCardAdditionalLinksHandler(
  _request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const rows = await query<CardAdditionalLinkRow>(
    `select "organizationId", "financialProfileId", "groupCardId", "cardId", "isPrimary", "createdAt", "updatedAt"
     from "CardAdditionalLink"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return json(200, { links: rows.map(mapCardAdditionalLinkRow) });
}

async function linkAdditionalCardHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const groupCardId = String(body.groupCardId ?? "");
  const cardId = String(body.cardId ?? "");

  requireCardId(groupCardId, "Informe o cartão principal.");
  requireCardId(cardId, "Informe o cartão adicional.");

  if (groupCardId === cardId) {
    throw Object.assign(new Error("O adicional precisa ser diferente do cartão principal."), {
      code: "CARD_ADDITIONAL_LINK_SAME_CARD",
      statusCode: 400,
    });
  }

  await assertCardExists(context, groupCardId);
  await assertCardExists(context, cardId);

  await withTransaction(async (executeQuery) => {
    const existingPrimary = await executeQuery<{ count: string }>(
      `select count(*)::text as count from "CardAdditionalLink"
       where "organizationId" = $1 and "financialProfileId" = $2 and "groupCardId" = $3 and "isPrimary" = true`,
      [context.organizationId, context.financialProfileId, groupCardId],
    );
    const hasPrimary = Number(existingPrimary[0]?.count ?? 0) > 0;

    await executeQuery(
      `insert into "CardAdditionalLink"
        ("organizationId", "financialProfileId", "groupCardId", "cardId", "isPrimary", "createdAt", "updatedAt")
       values ($1, $2, $3, $3, $4, current_timestamp, current_timestamp)
       on conflict ("groupCardId", "cardId") do update set
        "isPrimary" = "CardAdditionalLink"."isPrimary" or excluded."isPrimary",
        "updatedAt" = current_timestamp`,
      [context.organizationId, context.financialProfileId, groupCardId, !hasPrimary],
    );

    await executeQuery(
      `insert into "CardAdditionalLink"
        ("organizationId", "financialProfileId", "groupCardId", "cardId", "isPrimary", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, false, current_timestamp, current_timestamp)
       on conflict ("groupCardId", "cardId") do update set "updatedAt" = current_timestamp`,
      [context.organizationId, context.financialProfileId, groupCardId, cardId],
    );
  });

  return json(201, { links: await listLinksForGroup(context, groupCardId) });
}

async function setPrimaryCardHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const groupCardId = requireParam(match, "groupCardId");
  const cardId = String(body.cardId ?? "");

  requireCardId(cardId, "Informe o cartão principal.");
  await assertCardExists(context, groupCardId);
  await assertCardExists(context, cardId);

  const membership = await query<{ count: string }>(
    `select count(*)::text as count from "CardAdditionalLink"
     where "organizationId" = $1 and "financialProfileId" = $2 and "groupCardId" = $3 and "cardId" = $4`,
    [context.organizationId, context.financialProfileId, groupCardId, cardId],
  );

  if (Number(membership[0]?.count ?? 0) === 0) {
    throw Object.assign(new Error("Cartão não pertence a este cadastro."), {
      code: "CARD_ADDITIONAL_LINK_NOT_FOUND",
      statusCode: 404,
    });
  }

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `update "CardAdditionalLink" set "isPrimary" = false, "updatedAt" = current_timestamp
       where "organizationId" = $1 and "financialProfileId" = $2 and "groupCardId" = $3`,
      [context.organizationId, context.financialProfileId, groupCardId],
    );
    await executeQuery(
      `update "CardAdditionalLink" set "isPrimary" = true, "updatedAt" = current_timestamp
       where "organizationId" = $1 and "financialProfileId" = $2 and "groupCardId" = $3 and "cardId" = $4`,
      [context.organizationId, context.financialProfileId, groupCardId, cardId],
    );
  });

  return json(200, { links: await listLinksForGroup(context, groupCardId) });
}

async function listLinksForGroup(
  context: TenantContext,
  groupCardId: string,
): Promise<ReturnType<typeof mapCardAdditionalLinkRow>[]> {
  const rows = await query<CardAdditionalLinkRow>(
    `select "organizationId", "financialProfileId", "groupCardId", "cardId", "isPrimary", "createdAt", "updatedAt"
     from "CardAdditionalLink"
     where "organizationId" = $1 and "financialProfileId" = $2 and "groupCardId" = $3
     order by "isPrimary" desc, "createdAt" asc`,
    [context.organizationId, context.financialProfileId, groupCardId],
  );

  return rows.map(mapCardAdditionalLinkRow);
}

async function assertCardExists(context: TenantContext, cardId: string): Promise<void> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as count from "Card"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, context.organizationId, context.financialProfileId],
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    throw Object.assign(new Error("Cartão não encontrado."), {
      code: "CARD_NOT_FOUND",
      statusCode: 404,
    });
  }
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw Object.assign(new Error("Request body must be an object."), {
      code: "API_REQUEST_BODY_INVALID",
      statusCode: 400,
    });
  }

  return body as Record<string, unknown>;
}

function requireParam(match: Readonly<Record<string, string>>, key: string): string {
  const value = match[key];
  if (!value) {
    throw Object.assign(new Error(`Missing route parameter ${key}.`), {
      code: "API_ROUTE_PARAM_MISSING",
      statusCode: 400,
    });
  }

  return value;
}

function requireCardId(value: string, message: string): void {
  if (!value.trim()) {
    throw Object.assign(new Error(message), {
      code: "CARD_ADDITIONAL_LINK_CARD_REQUIRED",
      statusCode: 400,
    });
  }
}

function mapCardAdditionalLinkRow(row: CardAdditionalLinkRow) {
  return {
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    groupCardId: row.groupCardId,
    cardId: row.cardId,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
