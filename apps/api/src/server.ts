import "./load-env.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest, type MvpApiRequest } from "./mvp.js";
import { handlePayablesReceivablesApiRequest } from "./payables-receivables-router.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);
const MVP_PATHS = new Set(["/api/session", "/api/users", "/api/me"]);
const MAX_BODY_BYTES = 1_000_000;

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, host, () => {
  console.log(`@solverfin/api listening on http://${host}:${port}`);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const headers = normalizeHeaders(request.headers);
  const correlationId = resolveCorrelationId(headers);

  try {
    const body = await readJsonBody(request);
    const method = request.method ?? "GET";

    if (MVP_PATHS.has(url.pathname)) {
      const legacyResult = await dispatchLegacyRoute(method, url.pathname, headers, body);

      if (legacyResult) {
        writeResponse(response, legacyResult);

        return;
      }
    }

    const apiRequest: ApiRequest = {
      method: request.method ?? "GET",
      pathname: url.pathname,
      query: url.searchParams,
      headers,
      body,
    };

    const financialProfilesResult = await handleFinancialProfilesApiRequest(apiRequest);

    if (financialProfilesResult) {
      writeResponse(response, financialProfilesResult);

      return;
    }

    const importBatchesResult = await handleImportBatchesApiRequest(apiRequest);

    if (importBatchesResult) {
      writeResponse(response, importBatchesResult);

      return;
    }

    const aiReviewQueueResult = await handleAiReviewQueueApiRequest(apiRequest);

    if (aiReviewQueueResult) {
      writeResponse(response, aiReviewQueueResult);

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
    const errorResponse = buildApiErrorResponse({ error, correlationId });

    writeResponse(response, {
      statusCode: errorResponse.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: errorResponse.body,
    });
  }
}

async function dispatchLegacyRoute(
  method: string,
  pathname: string,
  headers: Readonly<Record<string, string | undefined>>,
  body: unknown,
): Promise<ApiResponse | undefined> {
  if (!MVP_PATHS.has(pathname)) {
    return undefined;
  }

  const mvpRequest = {
    method,
    path: pathname,
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
  response.writeHead(apiResponse.statusCode, apiResponse.headers);

  if (apiResponse.body === undefined) {
    response.end();

    return;
  }

  response.end(JSON.stringify(apiResponse.body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const bufferChunk = chunk as Buffer;
    totalBytes += bufferChunk.length;

    if (totalBytes > MAX_BODY_BYTES) {
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

function normalizeHeaders(
  headers: IncomingMessage["headers"],
): Readonly<Record<string, string | undefined>> {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value[0] : value;
  }

  return normalized;
}
