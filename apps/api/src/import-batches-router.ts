import {
  ImportFileError,
  TenantAuthorizationError,
  TenantError,
  type CsvDelimiter,
  type CsvImportMapping,
  type ImportSourceKind,
  type ImportStatus,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  approveConsistentImportSuggestionForContext,
  approveConsistentSelectedImportSuggestionsForContext,
  createConsistentCsvImportBatchForContext,
  createConsistentOfxImportBatchForContext,
  getConsistentImportBatchDetailForContext,
} from "./import-review-service.js";
import {
  ImportReviewError,
  discardImportBatchForContext,
  listImportBatchesForContext,
  previewCsvImportForContext,
  rejectImportSuggestionForContext,
  updateImportSuggestionForContext,
  type ImportSuggestionUpdatePayload,
} from "./repositories/imports.js";
import { previewOfxImportForContext } from "./repositories/ofx-imports.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type ImportBatchHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface ImportBatchRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: ImportBatchHandler;
}

const BASE_PATH = "/api/import-batches";
const routes: ImportBatchRoute[] = [];

route("GET", BASE_PATH, listImportBatchesHandler);
route("POST", `${BASE_PATH}/csv/preview`, previewCsvImportBatchHandler);
route("POST", `${BASE_PATH}/csv`, createCsvImportBatchHandler);
route("POST", `${BASE_PATH}/ofx/preview`, previewOfxImportBatchHandler);
route("POST", `${BASE_PATH}/ofx`, createOfxImportBatchHandler);
route("GET", `${BASE_PATH}/:importBatchId`, getImportBatchHandler);
route(
  "PATCH",
  `${BASE_PATH}/:importBatchId/suggestions/:suggestionId`,
  updateImportSuggestionHandler,
);
route(
  "POST",
  `${BASE_PATH}/:importBatchId/suggestions/:suggestionId/approve`,
  approveImportSuggestionHandler,
);
route(
  "POST",
  `${BASE_PATH}/:importBatchId/suggestions/:suggestionId/reject`,
  rejectImportSuggestionHandler,
);
route("POST", `${BASE_PATH}/:importBatchId/approve-selected`, approveSelectedHandler);
route("POST", `${BASE_PATH}/:importBatchId/discard`, discardImportBatchHandler);

export async function handleImportBatchesApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) return undefined;

  const correlationId = resolveCorrelationId(request.headers);
  const match = findRoute(request.method, request.pathname);
  if (!match) return undefined;

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
      body:
        error instanceof ImportReviewError && error.details !== undefined
          ? { ...response.body, details: error.details }
          : response.body,
    };
  }
}

function route(method: string, path: string, handler: ImportBatchHandler): void {
  const paramNames: string[] = [];
  const patternSource = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment;
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
): { route: ImportBatchRoute; params: Record<string, string> } | undefined {
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

async function listImportBatchesHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as ImportStatus | "all" | null;
  const sourceKind = readImportSourceKind(request.query.get("sourceKind"));
  return json(200, {
    importBatches: await listImportBatchesForContext(context, {
      ...(status ? { status } : {}),
      ...(sourceKind ? { sourceKind } : {}),
    }),
  });
}

async function previewCsvImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  assertConsent(body);
  return json(
    200,
    await previewCsvImportForContext(context, {
      originalFileName: requireString(body, "originalFileName"),
      content: requireString(body, "content"),
      accountId: requireString(body, "accountId"),
      consentAccepted: true,
      ...(readCsvMapping(body.csvMapping) === undefined
        ? {}
        : { csvMapping: readCsvMapping(body.csvMapping) as CsvImportMapping }),
      ...(readCsvDelimiter(body.csvDelimiter) === undefined
        ? {}
        : { csvDelimiter: readCsvDelimiter(body.csvDelimiter) as CsvDelimiter }),
    }),
  );
}

async function createCsvImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  assertConsent(body);
  const result = await createConsistentCsvImportBatchForContext(context, {
    originalFileName: requireString(body, "originalFileName"),
    content: requireString(body, "content"),
    accountId: requireString(body, "accountId"),
    consentAccepted: true,
    ...(readCsvMapping(body.csvMapping) === undefined
      ? {}
      : { csvMapping: readCsvMapping(body.csvMapping) as CsvImportMapping }),
    ...(readCsvDelimiter(body.csvDelimiter) === undefined
      ? {}
      : { csvDelimiter: readCsvDelimiter(body.csvDelimiter) as CsvDelimiter }),
  });
  return json(result.duplicateBatch ? 200 : 201, result);
}

async function previewOfxImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  assertConsent(body);
  return json(
    200,
    await previewOfxImportForContext(context, {
      originalFileName: requireString(body, "originalFileName"),
      content: requireString(body, "content"),
      accountId: requireString(body, "accountId"),
      consentAccepted: true,
    }),
  );
}

async function createOfxImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  assertConsent(body);
  const result = await createConsistentOfxImportBatchForContext(context, {
    originalFileName: requireString(body, "originalFileName"),
    content: requireString(body, "content"),
    accountId: requireString(body, "accountId"),
    consentAccepted: true,
  });
  return json(result.duplicateBatch ? 200 : 201, result);
}

async function getImportBatchHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(
    200,
    await getConsistentImportBatchDetailForContext(context, requireParam(match, "importBatchId")),
  );
}

async function updateImportSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  return json(
    200,
    await updateImportSuggestionForContext(
      context,
      requireParam(match, "importBatchId"),
      requireParam(match, "suggestionId"),
      readSuggestionUpdate(body),
    ),
  );
}

async function approveImportSuggestionHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(
    200,
    await approveConsistentImportSuggestionForContext(
      context,
      requireParam(match, "importBatchId"),
      requireParam(match, "suggestionId"),
    ),
  );
}

async function rejectImportSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);
  return json(
    200,
    await rejectImportSuggestionForContext(
      context,
      requireParam(match, "importBatchId"),
      requireParam(match, "suggestionId"),
      body.reason === undefined ? undefined : String(body.reason),
    ),
  );
}

async function approveSelectedHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  if (!Array.isArray(body.suggestionIds)) {
    throw new ImportReviewError(
      "IMPORT_REVIEW_SELECTION_REQUIRED",
      "Informe as linhas selecionadas para confirmar.",
    );
  }
  return json(
    200,
    await approveConsistentSelectedImportSuggestionsForContext(
      context,
      requireParam(match, "importBatchId"),
      body.suggestionIds.map((value) => String(value)),
    ),
  );
}

async function discardImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);
  return json(
    200,
    await discardImportBatchForContext(
      context,
      requireParam(match, "importBatchId"),
      body.reason === undefined ? undefined : String(body.reason),
    ),
  );
}

function assertConsent(body: Record<string, unknown>): void {
  if (body.consentAccepted !== true) {
    throw new ImportReviewError(
      "IMPORT_CONSENT_REQUIRED",
      "Confirme que o arquivo pode ser processado neste perfil financeiro.",
    );
  }
}

function readImportSourceKind(value: string | null): ImportSourceKind | undefined {
  if (value === null || value.length === 0) return undefined;
  if (value !== "csv" && value !== "ofx") {
    throw new ImportReviewError(
      "IMPORT_SOURCE_KIND_INVALID",
      "Origem deve ser csv ou ofx.",
    );
  }
  return value;
}

function readSuggestionUpdate(body: Record<string, unknown>): ImportSuggestionUpdatePayload {
  const payload: ImportSuggestionUpdatePayload = {};
  if (body.occurredOn !== undefined) payload.occurredOn = requireString(body, "occurredOn");
  if (body.kind !== undefined) {
    const kind = String(body.kind);
    if (kind !== "income" && kind !== "expense" && kind !== "transfer") {
      throw new ImportReviewError(
        "IMPORT_KIND_INVALID",
        "Tipo deve ser receita, despesa ou transferencia.",
      );
    }
    payload.kind = kind;
  }
  if (body.amountMinor !== undefined) {
    const value = Number(body.amountMinor);
    if (!Number.isSafeInter(value) || value <= 0) {
      throw new ImportReviewError(
        "IMPORT_AMOUNT_INVALID",
        "Valor precisa ser um inteiro positivo em centavos.",
      );
    }
    payload.amountMinor = value;
  }
  if (body.description !== undefined) payload.description = requireString(body, "description");
  if (body.accountId !== undefined) payload.accountId = requireString(body, "accountId");
  if (body.otherAccountId === null) payload.otherAccountId = null;
  else if (body.otherAccountId !== undefined)
    payload.otherAccountId = requireString(body, "otherAccountId");
  if (body.categoryId === null) payload.categoryId = nullì(€•±Í”¥˜€¡‰½‘ä¹…Ñ•½Éå%€„ôôÕ¹‘•™¥¹•¤(€€€Á…å±½…¹…Ñ•½Éå%€ôÉ•ÅÕ¥É•MÑÉ¥¹œ¡‰½‘ä°€‰…Ñ•½Éå%ˆ¤ì(€¥˜€¡=‰©•Ð¹­•åÌ¡Á…å±½…¤¹±•¹Ñ €ôôô€À¤ì(€€€Ñ¡É½Ü¹•Ü%µÁ½ÉÑI•Ù¥•ÝÉÉ½È (€€€€€€‰%5A=IQ}UAQ}IEU%Iˆ°(€€€€€€‰%¹™½Éµ”…¼µ•¹½ÌÕ´…µÁ¼Á…É„½ÉÉ¥¥È„±¥¹¡„¸ˆ°(€€€€¤ì(€ô(€É•ÑÕÉ¸Á…å±½…ì)ô()™Õ¹Ñ¥½¸É•…‘ÍÙ5…ÁÁ¥¹œ¡Ù…±Õ”èÕ¹­¹½Ý¸¤èÍÙ%µÁ½ÉÑ5…ÁÁ¥¹œðÕ¹‘•™¥¹•ì(€¥˜€¡Ù…±Õ”€ôôôÕ¹‘•™¥¹•¤É•ÑÕÉ¸Õ¹‘•™¥¹•ì(€¥˜€¡ÑåÁ•½˜Ù…±Õ”€„ôô€‰½‰©•ÐˆñðÙ…±Õ”€ôôô¹Õ±°ñðÉÉ…ä¹¥ÍÉÉ…ä¡Ù…±Õ”¤¤ì(€€€Ñ¡É½Ü¹•Ü%µÁ½ÉÑI•Ù¥•ÝÉÉ½È (€€€€€€‰%5A=IQ}MY}5AA%9}%9Y1%ˆ°(€€€€€€‰5…Á•…µ•¹Ñ¼MXÁÉ•¥Í„Í•ÈÕ´½‰©•Ñ¼¸ˆ°(€€€€¤ì(€ô(€½¹ÍÐ¥¹ÁÕÐ€ôÙ…±Õ”…ÌI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸øì(€½¹ÍÐÉ•…‘=ÁÑ¥½¹…±MÑÉ¥¹œ€ô€¡­•äèÍÑÉ¥¹œ¤èÍÑÉ¥¹œðÕ¹‘•™¥¹•€ôøì(€€€½¹ÍÐ…¹‘¥‘…Ñ”€ô¥¹ÁÕÑm­•åtì(€€€¥˜€¡…¹‘¥‘…Ñ”€ôôôÕ¹‘•™¥¹•ñð…¹‘¥‘…Ñ”€ôôô¹Õ±°ñðMÑÉ¥¹œ¡…¹‘¥‘…Ñ”¤¹ÑÉ¥´ ¤¹±•¹Ñ €ôôô€À¤ì(€€€€€É•ÑÕÉ¸Õ¹‘•™¥¹•ì(€€€ô(€€€É•ÑÕÉ¸MÑÉ¥¹œ¡…¹‘¥‘…Ñ”¤ì(€ôì(€½¹ÍÐ‘…Ñ”€ôÉ•…‘=ÁÑ¥½¹…±MÑÉ¥¹œ ‰‘…Ñ”ˆ¤ì(€½¹ÍÐ‘•ÍÉ¥ÁÑ¥½¸€ôÉ•…‘=ÁÑ¥½¹…±MÑÉ¥¹œ ‰‘•ÍÉ¥ÁÑ¥½¸ˆ¤ì(€½¹ÍÐ…µ½Õ¹Ð€ôÉ•…‘=ÁÑ¥½¹…±MÑÉ¥¹œ ‰…µ½Õ¹Ðˆ¤ì(€½¹ÍÐ¥¹½µ•µ½Õ¹Ð€ôÉ•…‘=ÁÑ¥½¹…±MÑÉ¥¹œ ‰¥¹½µ•µ½Õ¹Ðˆ¤ì(€½¹ÍÐ•áÁ•¹Í•µ½Õ¹Ð€ôÉ•…‘=ÁÑ¥½¹…±MÑÉ¥¹œ ‰•áÁ•¹Í•µ½Õ¹Ðˆ¤ì(€½¹ÍÐÉ•ÅÕ•ÍÑÍXÈ€ô(€€€¥¹ÁÕÐ¹Ù•ÉÍ¥½¸€ôôô€Èñð(€€€¥¹ÁÕÐ¹Ù…±Õ•MÑÉ…Ñ•ä€„ôôÕ¹‘•™¥¹•ñð(€€€¥¹½µ•µ½Õ¹Ð€„ôôÕ¹‘•™¥¹•ñð(€€€•áÁ•¹Í•µ½Õ¹Ð€„ôôÕ¹‘•™¥¹•ì((€¥˜€¡É•ÅÕ•ÍÑÍXÈ¤ì(€€€½¹ÍÐÙ…±Õ•MÑÉ…Ñ•ä€ôMÑÉ¥¹œ¡¥¹ÁÕÐ¹Ù…±Õ•MÑÉ…Ñ•ä€üü€ˆˆ¤ì(€€€¥˜€¡Ù…±Õ•MÑÉ…Ñ•ä€„ôô€‰Í¥¹•ˆ€˜˜Ù…±Õ•MÑÉ…Ñ•ä€„ôô€‰ÍÁ±¥Ðˆ¤ì(€€€€€Ñ¡É½Ü¹•Ü%µÁ½ÉÑI•Ù¥•ÝÉÉ½È (€€€€€€€€‰%5A=IQ}MY}5AA%9}%9Y1%ˆ°(€€€€€€€€‰Í½±¡„Í”¼…ÉÅÕ¥Ù¼ÕÍ„Õ´Ù…±½È½´Í¥¹…°½Ô½±Õ¹…ÌÍ•Á…É…‘…Ì‘”•¹ÑÉ…‘„”Í‡µ‘„¸ˆ°(€€€€€€¤ì(€€€ô(€€€¥˜€¡Ù…±Õ•MÑÉ…Ñ•ä€ôôô€‰Í¥¹•ˆ¤ì(€€€€€¥˜€¡¥¹½µ•µ½Õ¹Ð€„ôôÕ¹‘•™¥¹•ñð•áÁ•¹Í•µµ½Õ¹Ð€„ôôÕ¹‘•™¥¹•¤ì(€€€€€€€Ñ¡É½Ü¹•Ü%µÁ½ÉÑI•Ù¥•ÝÉÉ½È (€€€€€€€€€€‰%5A=IQ}MY}5AA%9}%9Y1%ˆ°(€€€€€€€€€€‰Y…±½Èƒé¹¥¼»¼Á½‘”Í•È½µ‰¥¹…‘¼½´½±Õ¹…Ì‘”•¹ÑÉ…‘„”Í‡µ‘„¸ˆ°(€€€€€€€€¤ì(€€€€€ô(€€€€€É•ÑÕÉ¸ì(€€€€€€€Ù•ÉÍ¥½¸è€È°(€€€€€€€Ù…±Õ•MÑÉ…Ñ•äè€‰Í¥¹•ˆ°(€€€€€€€€¸¸¸¡‘…Ñ”€ôôôÕ¹‘•™¥¹•€üíô€èì‘…Ñ”ô¤°(€€€€€€€€¸¸¸¡‘•ÍÉ¥ÁÑ¥½¸€ôôôÕ¹‘•™¥¹•€üíô€èì‘•ÍÉ¥ÁÑ¥½¸ô¤°(€€€€€€€€¸¸¸¡…µ½Õ¹Ð€ôôôÕ¹‘•™¥¹•€üíô€èì…µ½Õ¹Ðô¤°(€€€€€ôì(€€€ô(€€€¥˜€¡…µ½Õ¹Ð€„ôôÕ¹‘•™¥¹•¤ì(€€€€€Ñ¡É½Ü¹•Ü%µÁ½ÉÑI•Ù¥•ÝÉÉ½È (€€€€€€€€‰%5A=IQ}MY}5AA%9}%9Y1%ˆ°(€€€€€€€€‰½±Õ¹…ÌÍ•Á…É…‘…Ì‘”•¹ÑÉ…‘„”Í‡µ‘„»¼Á½‘•´Í•È½µ‰¥¹…‘…Ì½´Ù…±½Èƒé¹¥¼¸ˆ°(€€€€€€¤ì(€€€ô(€€€É•ÑÕÉ¸ì(€€€€€Ù•ÉÍ¥½¸è€È°(€€€€€Ù…±Õ•MÑÉ…Ñ•äè€‰ÍÁ±¥Ðˆ°(€€€€€€¸¸¸¡‘…Ñ”€ôôôÕ¹‘•™¥¹•€üíô€èì‘…Ñ”ô¤°(€€€€€€¸¸¸¡‘•ÍÉ¥ÁÑ¥½¸€ôôôÕ¹‘•™¥¹•€üíô€èì‘•ÍÉ¥ÁÑ¥½¸ô¤°(€€€€€€¸¸¸¡¥¹½µ•µ½Õ¹Ð€ôôôÕ¹‘•™¥¹•€üíô€èì¥¹½µ•µ½Õ¹Ðô¤°(€€€€€€¸¸¸¡•áÁ•¹Í•µ½Õ¹Ð€ôôôÕ¹‘•™¥¹•€üíô€èì•áÁ•¹Í•µ½Õ¹Ðô¤°(€€€ôì(€ô((€É•ÑÕÉ¸ì(€€€Ù•ÉÍ¥½¸è€È°(€€€Ù…±Õ•MÑÉ…Ñ•äè€‰Í¥¹•ˆ°(€€€€¸¸¸¡‘…Ñ”€ôôôÕ¹‘•™¥¹•€üíô€èì‘…Ñ”ô¤°(€€€€¸¸¸¡‘•ÍÉ¥ÁÑ¥½¸€ôôôÕ¹‘•™¥¹•€üíô€èì‘•ÍÉ¥ÁÑ¥½¸ô¤°(€€€€¸¸¸¡…µ½Õ¹Ð€ôôôÕ¹‘•™¥¹•€üíô€èì…µ½Õ¹Ðô¤°(€ôì)ô()™Õ¹Ñ¥½¸É•…‘ÍÙ•±¥µ¥Ñ•È¡Ù…±Õ”èÕ¹­¹½Ý¸¤èÍÙ•±¥µ¥Ñ•ÈðÕ¹‘•™¥¹•ì(€¥˜€¡Ù…±Õ”€ôôôÕ¹‘•™¥¹•¤É•ÑÕÉ¸Õ¹‘•™¥¹•ì(€¥˜€¡Ù…±Õ”€„ôô€ˆ°ˆ€˜˜Ù…±Õ”€„ôô€ˆìˆ¤ì(€€€Ñ¡É½Ü¹•Ü%µÁ½ÉÑI•Ù¥•ÝÉÉ½È (€€€€€€‰%5A=IQ}MY}1%5%QI}%9Y1%ˆ°(€€€€€€‰M•Á…É…‘½ÈMX‘•Ù”Í•ÈÙ¥ÉÕ±„½ÔÁ½¹Ñ¼”Ù¥ÉÕ±„¸ˆ°(€€€€¤ì(€ô(€É•ÑÕÉ¸Ù…±Õ”ì)ô()™Õ¹Ñ¥½¸½ÁÑ¥½¹…±=‰©•Ñ	½‘ä¡‰½‘äèÕ¹­¹½Ý¸¤èI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸øì(€É•ÑÕÉ¸‰½‘ä€ôôôÕ¹‘•™¥¹•€üíô€èÉ•ÅÕ¥É•=‰©•Ñ	½‘ä¡‰½‘ä¤ì)ô()™Õ¹Ñ¥½¸É•ÅÕ¥É•=‰©•Ñ	½‘ä¡‰½‘äèÕ¹­¹½Ý¸¤èI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸øì(€¥˜€¡ÑåÁ•½˜‰½‘ä€„ôô€‰½‰©•Ðˆñð‰½‘ä€ôôô¹Õ±°ñðÉÉ…ä¹¥ÍÉÉ…ä¡‰½‘ä¤¤ì(€€€Ñ¡É½Ü¹•ÜÕÑ¡ÉÉ½È ‰UQ!}%9Y1%}I9Q%1Lˆ°€‰I•ÅÕ•ÍÐ‰½‘äµÕÍÐ‰”„)M=8½‰©•Ð¸ˆ°€ÐÀÀ¤ì(€ô(€É•ÑÕÉ¸‰½‘ä…ÌI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸øì)ô()™Õ¹Ñ¥½¸É•ÅÕ¥É•MÑÉ¥¹œ¡‰½‘äèI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸ø°­•äèÍÑÉ¥¹œ¤èÍÑÉ¥¹œì(€½¹ÍÐÙ…±Õ”€ô‰½‘åm­•åtì(€¥˜€¡ÑåÁ•½˜Ù…±Õ”€„ôô€‰ÍÑÉ¥¹œˆñðÙ…±Õ”¹ÑÉ¥´ ¤¹±•¹Ñ €ôôô€À¤ì(€€€Ñ¡É½Ü¹•Ü%µÁ½ÉÑI•Ù¥•ÝÉÉ½È (€€€€€€‰%5A=IQ}%1}IEU%Iˆ°(€€€€€…µÁ¼€‘í­•åô”½‰É¥…Ñ½É¥¼Á…É„½¹Ñ¥¹Õ…È¹€°(€€€€¤ì(€ô(€É•ÑÕÉ¸Ù…±Õ”¹ÑÉ¥´ ¤ì)ô()™Õ¹Ñ¥½¸É•ÅÕ¥É•A…É…´¡µ…Ñ èI•…‘½¹±äñI•½ÉñÍÑÉ¥¹œ°ÍÑÉ¥¹œøø°¹…µ”èÍÑÉ¥¹œ¤èÍÑÉ¥¹œì(€½¹ÍÐÙ…±Õ”€ôµ…Ñ¡m¹…µ•tì(€¥˜€ …Ù…±Õ”¤Ñ¡É½Ü¹•ÜÕÑ¡ÉÉ½È ‰UQ!}MMM%=9}IEU%Iˆ°€‰5¥ÍÍ¥¹œÉ•ÅÕ¥É•Á…Ñ Á…É…µ•Ñ•È¸ˆ°€ÐÀÀ¤ì(€É•ÑÕÉ¸Ù…±Õ”ì)ô()™Õ¹Ñ¥½¸‰Õ¥±‘ÕÑ¡!•…‘•ÉÌ¡…ÕÑ¡½É¥é…Ñ¥½¸èÍÑÉ¥¹œðÕ¹‘•™¥¹•¤èì(€…ÕÑ¡½É¥é…Ñ¥½¸üèÍÑÉ¥¹œì)ôì(€É•ÑÕÉ¸…ÕÑ¡½É¥é…Ñ¥½¸€ôôôÕ¹‘•™¥¹•€üíô€èì…ÕÑ¡½É¥é…Ñ¥½¸ôì)ô()™Õ¹Ñ¥½¸©Í½¸¡ÍÑ…ÑÕÍ½‘”è¹Õµ‰•È°‰½‘äèÕ¹­¹½Ý¸¤èÁ¥I•ÍÁ½¹Í”ì(€É•ÑÕÉ¸ì(€€€ÍÑ…ÑÕÍ½‘”°(€€€¡•…‘•ÉÌèì€‰½¹Ñ•¹ÐµÑåÁ”ˆè€‰…ÁÁ±¥…Ñ¥½¸½©Í½¸ì¡…ÉÍ•ÐõÕÑ˜´àˆô°(€€€‰½‘ä°(€ôì)ô()™Õ¹Ñ¥½¸µ…Á½µ…¥¹ÉÉ½È¡•ÉÉ½ÈèÕ¹­¹½Ý¸¤èÕ¹­¹½Ý¸ì(€¥˜€¡•ÉÉ½È¥¹ÍÑ…¹•½˜%µÁ½ÉÑ¥±•ÉÉ½Èñð•ÉÉ½È¥¹ÍÑ…¹•½˜%µÁ½ÉÑI•Ù¥•ÝÉÉ½È¤ì(€€€É•ÑÕÉ¸ì(€€€€€½‘”è•ÉÉ½È¹½‘”°(€€€€€ÍÑ…ÑÕÍ½‘”è•ÉÉ½È¹ÍÑ…ÑÕÍ½‘”°(€€€€€µ•ÍÍ…”è•ÉÉ½È¹µ•ÍÍ…”°(€€€ôì(€ô(€¥˜€¡•ÉÉ½È¥¹ÍÑ…¹•½˜Q•¹…¹ÑÉÉ½È¤ì(€€€É•ÑÕÉ¸ì(€€€€€½‘”è•ÉÉ½È¹½‘”°(€€€€€ÍÑ…ÑÕÍ½‘”è•ÉÉ½È¹½‘”€ôôô€‰Q99Q}AI=%1}IEU%Iˆ€ü€ÐÀÐ€è€ÐÀÌ°(€€€€€µ•ÍÍ…”è•ÉÉ½È¹µ•ÍÍ…”°(€€€ôì(€ô(€¥˜€¡•ÉÉ½È¥¹ÍÑ…¹•½˜Q•¹…¹ÑÕÑ¡½É¥é…Ñ¥½¹ÉÉ½È¤ì(€€€É•ÑÕÉ¸ì(€€€€€½‘”è•ÉÉ½È¹½‘”°(€€€€€ÍÑ…ÑÕÍ½‘”è•ÉÉ½È¹ÍÑ…ÑÕÍ½‘”°(€€€€€µ•ÍÍ…”è•ÉÉ½È¹µ•ÍÍ…”°(€€€ôì(€ô(€É•ÑÕÉ¸•ÉÉ½Èì)ô(