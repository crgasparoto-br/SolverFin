import type {
  AiProvider,
  AiProviderResult,
  AiTaskKind,
  SafeAiProviderRequest,
} from "./index.js";
import { AiProviderError } from "./provider-errors.js";

const PROVIDER_ENV = "AI_PROVIDER";
const ENDPOINT_ENV = "AI_OPENAI_ENDPOINT";
const API_KEY_ENV = "AI_OPENAI_API_KEY";
const MODEL_ENV = "AI_OPENAI_MODEL";
const MAX_OUTPUT_TOKENS_ENV = "AI_OPENAI_MAX_OUTPUT_TOKENS";
const MAX_REQUEST_BYTES_ENV = "AI_OPENAI_MAX_REQUEST_BYTES";
const REQUEST_TIMEOUT_ENV = "AI_OPENAI_REQUEST_TIMEOUT_MS";
const SUPPORTED_TASKS: readonly AiTaskKind[] = [
  "extraction",
  "classification",
  "summary",
  "assistant",
];

export type RawAiProviderEnvironment = Readonly<Record<string, string | undefined>>;

export interface OpenAiProviderConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  maxRequestBytes: number;
  requestTimeoutMs: number;
}

export interface AiHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type AiHttpClient = (
  url: string,
  init: {
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<AiHttpResponse>;

export type AiProviderConfigurationHealth =
  | {
      status: "disabled";
      providerId: "disabled";
      issues: readonly [];
    }
  | {
      status: "ready";
      providerId: "openai";
      model: string;
      endpointOrigin: string;
      issues: readonly [];
    }
  | {
      status: "invalid";
      providerId: "openai" | "unknown";
      issues: readonly string[];
    };

export type AiProviderSelection =
  | {
      status: "disabled";
      provider: undefined;
      health: Extract<AiProviderConfigurationHealth, { status: "disabled" }>;
    }
  | {
      status: "ready";
      provider: OpenAiProvider;
      health: Extract<AiProviderConfigurationHealth, { status: "ready" }>;
    };

export class AiProviderConfigurationError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: readonly string[]) {
    const uniqueNames = [...new Set(variableNames)].sort();
    super(`Invalid AI provider configuration: ${uniqueNames.join(", ")}.`);
    this.name = "AiProviderConfigurationError";
    this.variableNames = uniqueNames;
  }
}

export class OpenAiProvider implements AiProvider {
  readonly id = "openai";
  readonly model: string;

  private readonly config: OpenAiProviderConfig;
  private readonly httpClient: AiHttpClient;

  constructor(config: OpenAiProviderConfig, httpClient: AiHttpClient = defaultHttpClient) {
    this.config = { ...config };
    this.model = config.model;
    this.httpClient = httpClient;
  }

  async complete(request: SafeAiProviderRequest): Promise<AiProviderResult> {
    if (!SUPPORTED_TASKS.includes(request.task)) {
      throw new AiProviderError("permanent", "Unsupported AI task.", { retryable: false });
    }

    const body = JSON.stringify(buildOpenAiRequest(this.config, request));

    if (new TextEncoder().encode(body).byteLength > this.config.maxRequestBytes) {
      throw new AiProviderError("permanent", "AI provider request exceeds the configured limit.", {
        retryable: false,
      });
    }

    const controller = new AbortController();
    const timeoutMs = Math.max(1, Math.min(request.timeoutMs, this.config.requestTimeoutMs));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      "content-type": "application/json",
    };

    if (request.correlationId !== undefined) {
      headers["x-client-request-id"] = request.correlationId;
    }

    try {
      const response = await this.httpClient(this.config.endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw mapHttpFailure(response.status);
      }

      return parseOpenAiResponse(await response.text());
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }

      if (controller.signal.aborted || isAbortError(error)) {
        throw new AiProviderError("timeout", "AI provider request timed out.", {
          retryable: true,
          cause: error,
        });
      }

      throw new AiProviderError("unavailable", "AI provider is unavailable.", {
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function loadOpenAiProviderConfig(
  rawEnv: RawAiProviderEnvironment,
): OpenAiProviderConfig | undefined {
  const provider = rawEnv[PROVIDER_ENV]?.trim().toLowerCase() || "disabled";

  if (provider === "disabled") {
    return undefined;
  }

  if (provider !== "openai") {
    throw new AiProviderConfigurationError([PROVIDER_ENV]);
  }

  const invalidVariables: string[] = [];
  const endpoint = readRequired(rawEnv, ENDPOINT_ENV, invalidVariables);
  const apiKey = readRequired(rawEnv, API_KEY_ENV, invalidVariables);
  const model = readRequired(rawEnv, MODEL_ENV, invalidVariables);
  const maxOutputTokens = readInteger(
    rawEnv,
    MAX_OUTPUT_TOKENS_ENV,
    1,
    32_768,
    invalidVariables,
  );
  const maxRequestBytes = readInteger(
    rawEnv,
    MAX_REQUEST_BYTES_ENV,
    1_024,
    262_144,
    invalidVariables,
  );
  const requestTimeoutMs = readInteger(
    rawEnv,
    REQUEST_TIMEOUT_ENV,
    100,
    120_000,
    invalidVariables,
  );

  if (endpoint !== undefined && !isSafeProviderEndpoint(endpoint)) {
    invalidVariables.push(ENDPOINT_ENV);
  }

  if (apiKey !== undefined && (apiKey.length < 20 || /\s/.test(apiKey))) {
    invalidVariables.push(API_KEY_ENV);
  }

  if (model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(model)) {
    invalidVariables.push(MODEL_ENV);
  }

  if (invalidVariables.length > 0) {
    throw new AiProviderConfigurationError(invalidVariables);
  }

  return {
    endpoint: endpoint as string,
    apiKey: apiKey as string,
    model: model as string,
    maxOutputTokens: maxOutputTokens as number,
    maxRequestBytes: maxRequestBytes as number,
    requestTimeoutMs: requestTimeoutMs as number,
  };
}

export function inspectAiProviderConfiguration(
  rawEnv: RawAiProviderEnvironment,
): AiProviderConfigurationHealth {
  try {
    const config = loadOpenAiProviderConfig(rawEnv);

    if (config === undefined) {
      return { status: "disabled", providerId: "disabled", issues: [] };
    }

    return {
      status: "ready",
      providerId: "openai",
      model: config.model,
      endpointOrigin: new URL(config.endpoint).origin,
      issues: [],
    };
  } catch (error) {
    if (error instanceof AiProviderConfigurationError) {
      return {
        status: "invalid",
        providerId:
          rawEnv[PROVIDER_ENV]?.trim().toLowerCase() === "openai" ? "openai" : "unknown",
        issues: error.variableNames,
      };
    }

    return { status: "invalid", providerId: "unknown", issues: [PROVIDER_ENV] };
  }
}

export function createAiProviderFromEnvironment(
  rawEnv: RawAiProviderEnvironment,
  httpClient: AiHttpClient = defaultHttpClient,
): AiProviderSelection {
  const config = loadOpenAiProviderConfig(rawEnv);

  if (config === undefined) {
    return {
      status: "disabled",
      provider: undefined,
      health: { status: "disabled", providerId: "disabled", issues: [] },
    };
  }

  const health: Extract<AiProviderConfigurationHealth, { status: "ready" }> = {
    status: "ready",
    providerId: "openai",
    model: config.model,
    endpointOrigin: new URL(config.endpoint).origin,
    issues: [],
  };

  return {
    status: "ready",
    provider: new OpenAiProvider(config, httpClient),
    health,
  };
}

function buildOpenAiRequest(
  config: OpenAiProviderConfig,
  request: SafeAiProviderRequest,
): Record<string, unknown> {
  return {
    model: config.model,
    max_completion_tokens: config.maxOutputTokens,
    messages: [
      {
        role: "system",
        content:
          "You are a constrained SolverFin financial assistant. Return either plain text or a JSON object with text, optional structured, and optional confidence from 0 to 1. Do not infer or request data beyond the supplied purpose and fields.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: request.task,
          purpose: request.purpose,
          prompt: request.prompt,
          fields: request.fields,
        }),
      },
    ],
  };
}

function parseOpenAiResponse(rawBody: string): AiProviderResult {
  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    throw new AiProviderError("invalid_response", "AI provider returned invalid JSON.", {
      retryable: false,
      cause: error,
    });
  }

  const content = readAssistantContent(body).trim();

  if (content.length === 0) {
    throw new AiProviderError("invalid_response", "AI provider returned an empty response.", {
      retryable: false,
    });
  }

  if (!content.startsWith("{")) {
    return { text: content };
  }

  let envelope: unknown;

  try {
    envelope = JSON.parse(content);
  } catch (error) {
    throw new AiProviderError("invalid_response", "AI provider returned an invalid envelope.", {
      retryable: false,
      cause: error,
    });
  }

  if (
    !isRecord(envelope) ||
    typeof envelope.text !== "string" ||
    envelope.text.trim().length === 0
  ) {
    throw new AiProviderError("invalid_response", "AI provider envelope is invalid.", {
      retryable: false,
    });
  }

  if (
    envelope.confidence !== undefined &&
    (typeof envelope.confidence !== "number" ||
      !Number.isFinite(envelope.confidence) ||
      envelope.confidence < 0 ||
      envelope.confidence > 1)
  ) {
    throw new AiProviderError("invalid_response", "AI provider confidence is invalid.", {
      retryable: false,
    });
  }

  const result: AiProviderResult = { text: envelope.text.trim() };

  if (envelope.structured !== undefined) {
    result.structured = envelope.structured;
  }

  if (typeof envelope.confidence === "number") {
    result.confidence = envelope.confidence;
  }

  return result;
}

function readAssistantContent(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return "";
  }

  const firstChoice = body.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return "";
  }

  const content = firstChoice.message.content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("");
}

function mapHttpFailure(statusCode: number): AiProviderError {
  if (statusCode === 408) {
    return new AiProviderError("timeout", "AI provider request timed out.", {
      retryable: true,
      statusCode,
    });
  }

  if (statusCode === 429) {
    return new AiProviderError("rate_limited", "AI provider rate limit reached.", {
      retryable: true,
      statusCode,
    });
  }

  if (statusCode >= 500) {
    return new AiProviderError("unavailable", "AI provider is unavailable.", {
      retryable: true,
      statusCode,
    });
  }

  return new AiProviderError("permanent", "AI provider rejected the request.", {
    retryable: false,
    statusCode,
  });
}

function readRequired(
  rawEnv: RawAiProviderEnvironment,
  name: string,
  invalidVariables: string[],
): string | undefined {
  const value = rawEnv[name]?.trim();

  if (!value) {
    invalidVariables.push(name);
    return undefined;
  }

  return value;
}

function readInteger(
  rawEnv: RawAiProviderEnvironment,
  name: string,
  minimum: number,
  maximum: number,
  invalidVariables: string[],
): number | undefined {
  const value = rawEnv[name]?.trim();
  const parsed = value === undefined || value === "" ? Number.NaN : Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    invalidVariables.push(name);
    return undefined;
  }

  return parsed;
}

function isSafeProviderEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const defaultHttpClient: AiHttpClient = async (url, init) => fetch(url, init);
