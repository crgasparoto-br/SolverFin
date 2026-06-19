import { TenantAuthorizationError, TenantError, type FinancialContextKind } from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  archiveFinancialProfileForUser,
  createFinancialProfileForUser,
  listFinancialProfilesForUser,
  updateFinancialProfileForUser,
} from "./repositories/financial-profiles.js";
import type { ApiRequest, ApiResponse } from "./router.js";

interface FinancialProfileRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: FinancialProfileHandler;
}

type FinancialProfileHandler = (
  request: ApiRequest,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

const BASE_PATH = "/api/financial-profiles";
const routes: FinancialProfileRoute[] = [];

route("GET", BASE_PATH, listFinancialProfilesHandler);
route("POST", BASE_PATH, createFinancialProfileHandler);
route("PATCH", `${BASE_PATH}/:profileId`, updateFinancialProfileHandler);
route("POST", `${BASE_PATH}/:profileId/archive`, archiveFinancialProfileHandler);

export async function handleFinancialProfilesApiRequest(
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
    return await match.route.handler(request, match.params);
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

function route(method: string, path: string, handler: FinancialProfileHandler): void {
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
): { route: FinancialProfileRoute; params: Record<string, string> } | undefined {
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

async function listFinancialProfilesHandler(request: ApiRequest): Promise<ApiResponse> {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
  const profiles = await listFinancialProfilesForUser(user.id);

  return json(200, {
    profiles: profiles.map(serializeFinancialProfile),
    activeProfileId: resolveActiveProfileId(profiles, request.query.get("profileId") ?? undefined),
  });
}

async function createFinancialProfileHandler(request: ApiRequest): Promise<ApiResponse> {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
  const body = requireObjectBody(request.body);
  const profile = await createFinancialProfileForUser(user, {
    name: String(body.name ?? ""),
    kind: body.kind as FinancialContextKind,
  });

  return json(201, { profile: serializeFinancialProfile(profile) });
}

async function updateFinancialProfileHandler(
  request: ApiRequest,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
  const body = requireObjectBody(request.body);
  const profile = await updateFinancialProfileForUser(user, requireParam(match, "profileId"), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.kind !== undefined ? { kind: body.kind as FinancialContextKind } : {}),
  });

  return json(200, { profile: serializeFinancialProfile(profile) });
}

async function archiveFinancialProfileHandler(
  request: ApiRequest,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
  const profile = await archiveFinancialProfileForUser(user, requireParam(match, "profileId"));

  return json(200, { profile: serializeFinancialProfile(profile) });
}

function serializeFinancialProfile(profile: {
  id: string;
  organizationId: string;
  name: string;
  kind: FinancialContextKind;
  status: string;
  createdAt: string;
  updatedAt: string;
}): Record<string, string> {
  return {
    id: profile.id,
    organizationId: profile.organizationId,
    name: profile.name,
    kind: profile.kind,
    status: profile.status,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function resolveActiveProfileId(
  profiles: readonly { id: string; kind: string; status: string }[],
  requestedProfileId: string | undefined,
): string | undefined {
  const activeProfiles = profiles.filter((profile) => profile.status === "active");

  if (requestedProfileId && activeProfiles.some((profile) => profile.id === requestedProfileId)) {
    return requestedProfileId;
  }

  return (activeProfiles.find((profile) => profile.kind === "personal") ?? activeProfiles[0])?.id;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new TenantError("TENANT_PROFILE_REQUIRED", "Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}

function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];

  if (!value) {
    throw new TenantError("TENANT_PROFILE_REQUIRED", `Missing required path parameter: ${name}.`);
  }

  return value;
}

function buildAuthHeaders(authorization: string | undefined): { authorization?: string } {
  return authorization === undefined ? {} : { authorization };
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
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 400 : 403;

    return { code: error.code, statusCode, message: error.message };
  }

  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  return error;
}
