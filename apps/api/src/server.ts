import "./load-env.js";
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";

import { assertExplicitRuntimeEnvironment } from "@solverfin/shared";

import { handleAccountRemunerationApiRequest } from "./account-remuneration-router.js";
import { startAccountRemunerationScheduler } from "./account-remuneration-scheduler.js";
import { assertLocalAuthAllowed, auditSecurityEvent, isDemoAuthAllowed } from "./auth-service.js";
import { handleCategorizationAwareAiReviewQueueApiRequest } from "./categorization-aware-ai-review-router.js";
import { handleCategorizationAwareImportBatchesApiRequest } from "./categorization-aware-import-router.js";
import { handleCategoryLearningApiRequest } from "./category-learning-router.js";
import { assertTrustedCognitoEnvironment } from "./cognito-config.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { handleFinancialAssistantApiRequest } from "./financial-assistant-router.js";
import { startOidcLoginAttemptScheduler } from "./oidc-attempt-scheduler.js";
import { assertTrustedMutationOrigin } from "./request-origin.js";
import { prepareRequestAuthenticationHeaders } from "./request-authentication.js";
import { handleAccountsApiRequest } from "./accounts-router.js";
import { handleAdminInstitutionsApiRequest } from "./admin-institutions-router.js";
import { handleAutomationRulesApiRequest } from "./automation-rules-router.js";
import { handleBankMessageInboxApiRequest } from "./bank-message-inbox-router.js";
import { handleCreditCardAccountsApiRequest } from "./credit-card-accounts-dispatcher.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest, type MvpApiRequest } from "./mvp.js";
import { handlePayablesReceivablesApiRequest } from "./payables-receivables-router.js";
import { handleReportsApiRequest } from "./reports-router.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";
import { handleTransactionGroupActionsApiRequest } from "./transaction-group-actions-router.js";

assertExplicitRuntimeEnvironment(process.env);

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);
const MVP_PATHS = new Set([
  "/api/session",
  "/api/session/oidc",
  "/api/session/renew",
  "/api/auth/oidc/start",
  "/api/auth/oidc/callback",
  "/api/users",
  "/api/me",
]);
const AUTH_HANDLER_PATHS = new Set(MVP_PATHS);
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const IMPORT_MAX_BODY_BYTES = 32 * 1024 * 1024;
const LARGE_IMPORT_BODY_PATHS = new Set([
  "/api/import-batches/csv/preview",
  "/api/import-batches/csv",
  "/api/import-batches/ofx/preview",
  "/api/import-batches/ofx",
]);

if (!isDemoAuthAllowed(process.env)) {
  assertTrustedCognitoEnvironment(process.env);
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, host, () => {
  console.log(`@solverfin/api listening on http://${host}:${port}`);
  startAccountRemunerationScheduler();
  startOidcLoginAttemptScheduler();
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const headers = normalizeHeaders(request.headers);
  const correlationId = resolveCorrelationId(headers);
  const method = request.method ?? "GET";

  try {
    assertLocalAuthenticationRouteAllowed(method, url.pathname);
    const body = await readJsonBody(request, resolveMaxBodyBytes(url.pathname));
    assertTrustedMutationOrigin({ method, headers });

    const effectiveHeaders = await prepareRequestAuthenticationHeaders({
      headers,
      pathname: url.pathname,
      authHandlerPaths: AUTH_HANDLER_PATHS,
    });

    if (MVP_PATHS.has(url.pathname)) {
      const legacyResult = await dispatchLegacyRoute(
        method,
        url.pathname,
        url.searchParams,
        effectiveHeaders,
        body,
      );

      if (legacyResult) {
        writeResponse(response, legacyResult);
        return;
      }
    }

    const apiRequest: ApiRequest = {
      method,
      pathname: url.pathname,
      query: url.searchParams,
      headers: effectiveHeaders,
      body,
    };

    const accountRemunerationResult = await handleAccountRemunerationApiRequest(apiRequest);

    if (accountRemunerationResult) {
      writeResponse(response, accountRemunerationResult);
      return;
    }

    const accountsResult = await handleAccountsApiRequest(apiRequest);

    if (accountsResult) {
      writeResponse(response, accountsResult);
      return;
    }

    const adminInstitutionsResult = await handleAdminInstitutionsApiRequest(apiRequest);

    if (adminInstitutionsResult) {
      writeResponse(response, adminInstitutionsResult);
      return;
    }

    const financialProfilesResult = await handleFinancialProfilesApiRequest(apiRequest);

    if (financialProfilesResult) {
      writeResponse(response, financialProfilesResult);
      return;
    }

    const financialAssistantResult = await handleFinancialAssistantApiRequest(apiRequest);

    if (financialAssistantResult) {
      writeResponse(response, financialAssistantResult);
      return;
    }

    const bankMessageInboxResult = await handleBankMessageInboxApiRequest(apiRequest);

    if (bankMessageInboxResult) {
      writeResponse(response, bankMessageInboxResult);
      return;
    }

    const importBatchesResult = await handleCategorizationAwareImportBatchesApiRequest(apiRequest);

    if (importBatchesResult) {
      writeResponse(response, importBatchesResult);
      return;
    }

    const installmentsResult = await handleInstallmentsApiRequest(apiRequest);

    if (installmentsResult) {
      writeResponse(response, installmentsResult);
      return;
    }

    const reportsResult = await handleReportsApiRequest(apiRequest);

    if (reportsResult) {
      writeResponse(response, reportsResult);
      return;
    }

    const aiReviewQueueResult = await handleCategorizationAwareAiReviewQueueApiRequest(apiRequest);

    if (aiReviewQueueResult) {
      writeResponse(response, aiReviewQueueResult);
      return;
    }

    const automationRulesResult = await handleAutomationRulesApiRequest(apiRequest);

    if (automationRulesResult) {
      writeResponse(response, automationRulesResult);
      return;
    }

    const categoryLearningResult = await handleCategoryLearningApiRequest(apiRequest);

    if (categoryLearningResult) {
      writeResponse(response, categoryLearningResult);
      return;
    }

    const deduplicationReconciliationResult =
      await handleDeduplicationReconciliationApiRequest(apiRequest);

    if (deduplicationReconciliationResult) {
      writeResponse(response, deduplicationReconciliationResult);
      return;
    }

    const payablesReceivablesResult = await handlePayablesReceivablesApiRequest(apiRequest);

    if (payablesReceivablesResult) {
      writeResponse(response, payablesReceivablesResult);
      return;
    }

    const creditCardAccountsResult = await handleCreditCardAccountsApiRequest(apiRequest);

    if (creditCardAccountsResult) {
      writeResponse(response, creditCardAccountsResult);
      return;
    }

    const transactionGroupActionsResult = await handleTransactionGroupActionsApiRequest(apiRequest);

    if (transactionGroupActionsResult) {
      writeResponse(response, transactionGroupActionsResult);
      return;
    }

    const result = await handleApiRequest(apiRequest);

    if (result) {
      writeResponse(response, result);
      return;
    }

    writeResponse(response, {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        error: {
          code: "API_ROUTE_NOT_FOUND",
          message: "Rota de API nao encontrada.",
          correlationId,
        },
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "AUTH_REQUEST_ORIGIN_INVALID"
    ) {
      await auditSecurityEvent({
        action: "origin_rejected",
        result: "denied",
        correlationId,
      }).catch(() => undefined);
    }

    const errorResponse = buildApiErrorResponse({ error, correlationId });

    writeResponse(response, {
      statusCode: errorResponse.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: errorResponse.body,
    });
  }
}

function assertLocalAuthenticationRouteAllowed(method: string, pathname: string): void {
  if (method !== "POST") return;
  if (pathname !== "/api/session" && pathname !== "/api/users") return;

  assertLocalAuthAllowed(process.env);
}

async function dispatchLegacyRoute(
  method: string,
  pathname: string,
  query: URLSearchParams,
  headers: Readonly<Record<string, string | undefined>>,
  body: unknown,
): Promise<ApiResponse | undefined> {
  if (!MVP_PATHS.has(pathname)) {
    return undefined;
  }

  const mvpRequest = {
    method,
    path: pathname,
    query,
    headers,
    body,
  } as MvpApiRequest;
  const mvpResponse = await handleMvpApiRequest(mvpRequest);

  return {
    statusCode: mvpResponse.statusCode,
    headers: mvpResponse.headers,
    body: mvpResponse.body,
  };
}

function writeResponse(response: ServerResponse, apiResponse: ApiResponse): void {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(apiResponse.headers)) {
    headers[name] = typeof value === "string" ? value : [...value];
  }
  response.writeHead(apiResponse.statusCode, headers);

  if (apiResponse.body === undefined) {
    response.end();
    return;
  }

  response.end(JSON.stringify(apiResponse.body));
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const bufferChunk = chunk as Buffer;
    totalBytes += bufferChunk.length;

    if (totalBytes > maxBodyBytes) {
      throw Object.assign(new Error("Request body too large."), {
        code: "API_REQUEST_BODY_TOO_LARGE",
        statusCode: 413,
      });
    }

    chunks.push(bufferChunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), {
      code: "API_REQUEST_BODY_INVALID_JSON",
      statusCode: 400,
    });
  }
}

function resolveMaxBodyBytes(pathname: string): number {
  return LARGE_IMPORT_BODY_PATHS.has(pathname) ? IMPORT_MAX_BODY_BYTES : DEFAULT_MAX_BODY_BYTES;
}

function normalizeHeaders(headers: IncomingMessage["headers"]): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }

  return normalized;
}
