export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

export interface ApiErrorLike {
  code?: string;
  statusCode?: number;
  message?: string;
}

export interface ApiLogEvent {
  level: "info" | "warn" | "error";
  code: string;
  correlationId: string;
  route?: string;
  statusCode?: number;
  safeDetails?: Readonly<Record<string, string | number | boolean | null>>;
}

export type ApiLogger = (event: ApiLogEvent) => void;

const DEFAULT_ERROR_MESSAGE = "Nao foi possivel concluir a acao. Tente novamente.";
const UNEXPECTED_ERROR_CODE = "API_UNEXPECTED_ERROR";
const CORRELATION_ID_HEADER = "x-correlation-id";

export function resolveCorrelationId(headers: Readonly<Record<string, string | undefined>>): string {
  const incoming = headers[CORRELATION_ID_HEADER]?.trim();

  if (incoming && /^[a-zA-Z0-9._:-]{8,120}$/.test(incoming)) {
    return incoming;
  }

  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildApiErrorResponse(input: {
  error: unknown;
  correlationId: string;
  fallbackMessage?: string;
}): { statusCode: number; body: ApiErrorResponse } {
  const apiError = normalizeApiError(input.error, input.fallbackMessage);

  return {
    statusCode: apiError.statusCode,
    body: {
      error: {
        code: apiError.code,
        message: apiError.message,
        correlationId: input.correlationId,
      },
    },
  };
}

export function logApiError(input: {
  logger?: ApiLogger;
  error: unknown;
  correlationId: string;
  route?: string;
}): void {
  if (!input.logger) {
    return;
  }

  const apiError = normalizeApiError(input.error);
  const event: ApiLogEvent = {
    level: apiError.statusCode >= 500 ? "error" : "warn",
    code: apiError.code,
    correlationId: input.correlationId,
    statusCode: apiError.statusCode,
  };

  if (input.route !== undefined) {
    event.route = input.route;
  }

  input.logger(event);
}

function normalizeApiError(
  error: unknown,
  fallbackMessage = DEFAULT_ERROR_MESSAGE,
): Required<Pick<ApiErrorLike, "code" | "statusCode" | "message">> {
  if (isApiErrorLike(error)) {
    return {
      code: error.code ?? UNEXPECTED_ERROR_CODE,
      statusCode: normalizeStatusCode(error.statusCode),
      message: sanitizeMessage(error.message ?? fallbackMessage),
    };
  }

  return {
    code: UNEXPECTED_ERROR_CODE,
    statusCode: 500,
    message: fallbackMessage,
  };
}

function isApiErrorLike(error: unknown): error is ApiErrorLike {
  return typeof error === "object" && error !== null;
}

function normalizeStatusCode(statusCode: number | undefined): number {
  if (statusCode === undefined || !Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    return 500;
  }

  return statusCode;
}

function sanitizeMessage(message: string): string {
  const normalized = message.trim();

  if (!normalized || /\b(?:stack|password|token|secret|cartao|conta \d{4,})\b/i.test(normalized)) {
    return DEFAULT_ERROR_MESSAGE;
  }

  return normalized;
}
