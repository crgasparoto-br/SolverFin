import { TenantAuthorizationError, TenantError, type InstallmentStatus } from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  listInstallmentsForContext,
  updateInstallmentForContext,
  type ListInstallmentsFilters,
  type UpdateInstallmentPayload,
} from "./repositories/installments.js";
import {
  createManualInstallmentsForContext,
  type CreateManualInstallmentsPayload,
} from "./repositories/manual-installments.js";

import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

interface InstallmentsRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: InstallmentsHandler;
}

type InstallmentsHandler = (
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

const BASE_PATH = "/api/installments";
const ALLOWED_PATCH_FIELDS = new Set(["description", "note", "categoryId"]);
const ALLOWED_CREATE_FIELDS = new Set([
  "accountId",
  "destinationAccountId",
  "categoryId",
  "kind",
  "status",
  "description",
  "note",
  "plannedOn",
  "effectiveOn",
  "amountMinor",
  "amountMode",
  "totalInstallments",
  "initialSequenceNumber",
  "idempotencyKey",
]);
const routes: InstallmentsRoute[] = [];

route("GET", BASE_PATH, listInstallmentsHandler);
route("POST", BASE_PATH, createInstallmentsHandler);
route("PATCH", `${BASE_PATH}/:installmentId`, updateInstallmentHandler);

export async function handleInstallmentsApiRequest(
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

function route(method: string, path: string, handler: InstallmentsHandler): void {
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
): { route: InstallmentsRoute; params: Record<string, string> } | undefined {
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

async function createInstallmentsHandler(request: ApiRequest): Promise<ApiResponse> {
  const context = await resolveContext(request);
  const result = await createManualInstallmentsForContext(
    context,
    readManualInstallmentCreatePayload(request.body),
  );

  return json(result.idempotentReplay ? 200 : 201, result);
}

async function listInstallmentsHandler(request: ApiRequest): Promise<ApiResponse> {
  const context = await resolveContext(request);
  const filters = readInstallmentFilters(request);

  return json(200, {
    installments: await listInstallmentsForContext(context, filters),
  });
}

async function updateInstallmentHandler(
  request: ApiRequest,
  params: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const context = await resolveContext(request);
  const payload = readInstallmentPatchPayload(request.body);
  const installment = await updateInstallmentForContext(
    context,
    requireParam(params, "installmentId"),
    payload,
  );

  return json(200, { installment });
}

async function resolveContext(request: ApiRequest) {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));

  return resolveRequestTenantContext(user, request.query.get("profileId") ?? undefined);
}

export function readManualInstallmentCreatePayload(body: unknown): CreateManualInstallmentsPayload {
  const payload = requireObjectBody(body);
  const idempotencyKey = payload.idempotencyKey;

  if (typeof idempotencyKey !== "string" || !isUuid(idempotencyKey)) {
    throw Object.assign(new Error("Informe uma chave de idempotencia UUID valida."), {
      code: "INSTALLMENT_IDEMPOTENCY_REQUIRED",
      statusCode: 400,
    });
  }

  const unknownFields = Object.keys(payload).filter((key) => !ALLOWED_CREATE_FIELDS.has(key));
  if (unknownFields.length > 0) {
    throwInstallmentPayloadInvalid("Campo nao permitido para criacao de parcelamento.");
  }

  const accountId = readRequiredText(payload, "accountId", "Conta de origem invalida.");
  const destinationAccountId = readNullableText(payload, "destinationAccountId");
  const categoryId = readNullableText(payload, "categoryId");
  const kind = payload.kind;
  const status = payload.status;
  const description = readRequiredText(
    payload,
    "description",
    "Descricao do parcelamento invalida.",
  ).trim();
  const plannedOn = payload.plannedOn;
  const effectiveOn = payload.effectiveOn;
  const amountMinor = payload.amountMinor;
  const amountMode = payload.amountMode;
  const totalInstallments = payload.totalInstallments;
  const initialSequenceNumber = payload.initialSequenceNumber;

  if (kind !== "income" && kind !== "expense" && kind !== "transfer") {
    throwInstallmentPayloadInvalid("Tipo de lancamento invalido.");
  }
  if (status !== "planned" && status !== "posted" && status !== "reconciled") {
    throwInstallmentPayloadInvalid("Situacao do parcelamento invalida.");
  }
  if (kind === "transfer" && !destinationAccountId) {
    throwInstallmentPayloadInvalid("Transferencias exigem uma conta de destino.");
  }
  if (kind !== "transfer" && destinationAccountId) {
    throwInstallmentPayloadInvalid("A conta de destino so pode ser usada em transferencias.");
  }
  if (description.length > 240) {
    throwInstallmentPayloadInvalid("A descricao deve ter no maximo 240 caracteres.");
  }
  if (typeof plannedOn !== "string" || !isValidDateOnly(plannedOn)) {
    throwInstallmentPayloadInvalid("Data prevista invalida.");
  }
  if (
    effectiveOn !== undefined &&
    effectiveOn !== null &&
    (typeof effectiveOn !== "string" || !isValidDateOnly(effectiveOn))
  ) {
    throwInstallmentPayloadInvalid("Data efetiva invalida.");
  }
  if (!Number.isInteger(amountMinor) || Number(amountMinor) <= 0) {
    throwInstallmentPayloadInvalid("Valor do parcelamento invalido.");
  }
  if (amountMode !== "per_installment" && amountMode !== "total") {
    throwInstallmentPayloadInvalid("Modo de valor do parcelamento invalido.");
  }
  if (
    !Number.isInteger(totalInstallments) ||
    Number(totalInstallments) < 2 ||
    Number(totalInstallments) > 60
  ) {
    throwInstallmentPayloadInvalid("Total de parcelas deve estar entre 2 e 60.");
  }
  if (
    !Number.isInteger(initialSequenceNumber) ||
    Number(initialSequenceNumber) < 1 ||
    Number(initialSequenceNumber) > Number(totalInstallments)
  ) {
    throwInstallmentPayloadInvalid("Parcela inicial invalida.");
  }
  if (amountMode === "total" && Number(amountMinor) < Number(totalInstallments)) {
    throwInstallmentPayloadInvalid("O valor total deve permitir ao menos um centavo por parcela.");
  }
  if (payload.note !== undefined && payload.note !== null && typeof payload.note !== "string") {
    throwInstallmentPayloadInvalid("Observacao do parcelamento invalida.");
  }

  return {
    accountId,
    destinationAccountId,
    categoryId,
    kind,
    status,
    description,
    note: typeof payload.note === "string" ? payload.note.trim() || null : null,
    plannedOn,
    effectiveOn: typeof effectiveOn === "string" ? effectiveOn : null,
    amountMinor: Number(amountMinor),
    amountMode,
    totalInstallments: Number(totalInstallments),
    initialSequenceNumber: Number(initialSequenceNumber),
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
}

function readRequiredText(
  payload: Record<string, unknown>,
  field: string,
  message: string,
): string {
  const value = payload[field];
  if (typeof value !== "string" || !value.trim()) {
    throwInstallmentPayloadInvalid(message);
  }
  return value.trim();
}

function readNullableText(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throwInstallmentPayloadInvalid(`${field} invalido.`);
  }
  return value.trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function readInstallmentFilters(request: ApiRequest): ListInstallmentsFilters {
  const dueFrom = readOptionalDateFilter(
    request,
    "dueFrom",
    "Data inicial de vencimento invalida.",
  );
  const dueTo = readOptionalDateFilter(request, "dueTo", "Data final de vencimento invalida.");
  const operationalFrom = readOptionalDateFilter(
    request,
    "operationalFrom",
    "Data operacional inicial invalida.",
  );
  const operationalTo = readOptionalDateFilter(
    request,
    "operationalTo",
    "Data operacional final invalida.",
  );

  return {
    ...(request.query.get("installmentId")
      ? { installmentId: String(request.query.get("installmentId")) }
      : {}),
    ...(request.query.get("transactionId")
      ? { transactionId: String(request.query.get("transactionId")) }
      : {}),
    ...(request.query.get("accountId")
      ? { accountId: String(request.query.get("accountId")) }
      : {}),
    ...(request.query.get("recurrenceId")
      ? { recurrenceId: String(request.query.get("recurrenceId")) }
      : {}),
    ...(request.query.get("cardId") ? { cardId: String(request.query.get("cardId")) } : {}),
    ...(request.query.get("cardInstrumentId")
      ? { cardInstrumentId: String(request.query.get("cardInstrumentId")) }
      : {}),
    ...(request.query.get("invoiceId")
      ? { invoiceId: String(request.query.get("invoiceId")) }
      : {}),
    ...(request.query.get("categoryId")
      ? { categoryId: String(request.query.get("categoryId")) }
      : {}),
    ...(dueFrom ? { dueFrom } : {}),
    ...(dueTo ? { dueTo } : {}),
    ...(operationalFrom ? { operationalFrom } : {}),
    ...(operationalTo ? { operationalTo } : {}),
    ...(request.query.get("status")
      ? { status: request.query.get("status") as InstallmentStatus | "all" }
      : {}),
  };
}

export function readInstallmentPatchPayload(body: unknown): UpdateInstallmentPayload {
  const payload = requireObjectBody(body);
  const allowedEntries = Object.entries(payload).filter(([key]) => ALLOWED_PATCH_FIELDS.has(key));

  if (allowedEntries.length !== Object.keys(payload).length) {
    throwInstallmentPayloadInvalid("Campo nao permitido para manutencao de parcela.");
  }

  if (allowedEntries.length === 0) {
    throwInstallmentPayloadInvalid("Informe ao menos um campo para atualizar.");
  }

  const update: UpdateInstallmentPayload = {};

  if (payload.description !== undefined) {
    if (typeof payload.description !== "string" || !payload.description.trim()) {
      throwInstallmentPayloadInvalid("Descricao da parcela invalida.");
    }

    update.description = payload.description;
  }

  if (payload.note !== undefined) {
    if (payload.note !== null && typeof payload.note !== "string") {
      throwInstallmentPayloadInvalid("Observacao da parcela invalida.");
    }

    update.note = payload.note;
  }

  if (payload.categoryId !== undefined) {
    if (payload.categoryId === null) {
      update.categoryId = null;
    } else {
      if (typeof payload.categoryId !== "string" || !payload.categoryId.trim()) {
        throwInstallmentPayloadInvalid("Categoria da parcela invalida.");
      }

      update.categoryId = payload.categoryId;
    }
  }

  return update;
}

function readOptionalDateFilter(
  request: ApiRequest,
  name: string,
  message: string,
): string | undefined {
  const value = request.query.get(name);
  if (!value) return undefined;
  if (!isValidDateOnly(value)) throwInstallmentsFilterInvalid(message);
  return value;
}

export function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throwInstallmentPayloadInvalid("Payload de parcela invalido.");
  }

  return body as Record<string, unknown>;
}

function requireParam(params: Readonly<Record<string, string>>, name: string): string {
  const value = params[name];

  if (!value) {
    throw Object.assign(new Error("Parametro obrigatorio ausente."), {
      code: "API_ROUTE_PARAMETER_REQUIRED",
      statusCode: 400,
    });
  }

  return value;
}

function throwInstallmentPayloadInvalid(message: string): never {
  throw Object.assign(new Error(message), {
    code: "INSTALLMENT_PAYLOAD_INVALID",
    statusCode: 400,
  });
}

function throwInstallmentsFilterInvalid(message: string): never {
  throw Object.assign(new Error(message), {
    code: "INSTALLMENTS_FILTER_INVALID",
    statusCode: 400,
  });
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
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;

    return { code: error.code, statusCode, message: error.message };
  }

  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  return error;
}
