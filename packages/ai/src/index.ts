export type AiTaskKind =
  | "extraction"
  | "classification"
  | "summary"
  | "assistant";
export type AiConsentState = "granted" | "revoked" | "missing";
export type AiLogLevel = "info" | "warn" | "error";

export interface AiUsagePolicy {
  consent: AiConsentState;
  purpose: string;
  maxPromptChars: number;
  maxRetries: number;
  timeoutMs: number;
  allowRawFinancialText: boolean;
  allowedFieldNames?: readonly string[];
  blockedFieldNamePatterns?: readonly RegExp[];
}

export interface AiUsageContext {
  organizationId: string;
  financialProfileId: string;
  userId?: string;
  correlationId?: string;
}

export interface AiTaskPayload {
  prompt: string;
  fields?: Readonly<
    Record<string, string | number | boolean | null | undefined>
  >;
}

export interface SafeAiProviderRequest {
  task: AiTaskKind;
  purpose: string;
  prompt: string;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  correlationId?: string;
  timeoutMs: number;
}

export interface AiProviderResult {
  text: string;
  structured?: unknown;
  confidence?: number;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  complete(request: SafeAiProviderRequest): Promise<AiProviderResult>;
}

export interface SafeAiLogEvent {
  level: AiLogLevel;
  code: string;
  providerId?: string;
  model?: string;
  task?: AiTaskKind;
  correlationId?: string;
  organizationId: string;
  financialProfileId: string;
  attempt?: number;
}

export type SafeAiLogger = (event: SafeAiLogEvent) => void;

export type AiTaskResult =
  | {
      status: "completed";
      providerId: string;
      model: string;
      result: AiProviderResult;
      sanitized: SanitizedAiPayload;
      attempts: number;
    }
  | {
      status: "blocked";
      code:
        | "AI_CONSENT_REQUIRED"
        | "AI_PAYLOAD_TOO_LARGE"
        | "AI_PAYLOAD_EMPTY";
      sanitized?: SanitizedAiPayload;
    }
  | {
      status: "failed";
      code: "AI_PROVIDER_ERROR" | "AI_PROVIDER_INVALID_RESPONSE";
      sanitized: SanitizedAiPayload;
      attempts: number;
    };

export interface SanitizedAiPayload {
  prompt: string;
  fields: Readonly<Record<string, string | number | boolean | null>>;
  redactedFieldNames: readonly string[];
  omittedFieldNames: readonly string[];
  originalPromptChars: number;
  sanitizedPromptChars: number;
}

export class FakeAiProvider implements AiProvider {
  readonly id = "fake";
  readonly model = "fake-local";

  private readonly responses: AiProviderResult[];

  constructor(
    responses: readonly AiProviderResult[] = [{ text: "ok", confidence: 1 }],
  ) {
    this.responses = [...responses];
  }

  async complete(_request: SafeAiProviderRequest): Promise<AiProviderResult> {
    const response = this.responses.shift();

    if (!response) {
      throw new Error("FakeAiProvider has no queued response.");
    }

    return response;
  }
}

export const defaultAiUsagePolicy: AiUsagePolicy = {
  consent: "missing",
  purpose: "unspecified",
  maxPromptChars: 4000,
  maxRetries: 1,
  timeoutMs: 8000,
  allowRawFinancialText: false,
  blockedFieldNamePatterns: [
    /account/i,
    /card/i,
    /document/i,
    /tax/i,
    /raw/i,
    /message/i,
    /payload/i,
    /secret/i,
    /token/i,
  ],
};

export async function runAiTask(input: {
  provider: AiProvider;
  task: AiTaskKind;
  context: AiUsageContext;
  policy: AiUsagePolicy;
  payload: AiTaskPayload;
  logger?: SafeAiLogger;
}): Promise<AiTaskResult> {
  if (input.policy.consent !== "granted") {
    logSafe(input, "warn", "AI_CONSENT_REQUIRED");
    return { status: "blocked", code: "AI_CONSENT_REQUIRED" };
  }

  const sanitized = sanitizeAiPayload(input.payload, input.policy);

  if (
    sanitized.prompt.length === 0 &&
    Object.keys(sanitized.fields).length === 0
  ) {
    logSafe(input, "warn", "AI_PAYLOAD_EMPTY");
    return { status: "blocked", code: "AI_PAYLOAD_EMPTY", sanitized };
  }

  if (sanitized.prompt.length > input.policy.maxPromptChars) {
    logSafe(input, "warn", "AI_PAYLOAD_TOO_LARGE");
    return { status: "blocked", code: "AI_PAYLOAD_TOO_LARGE", sanitized };
  }

  const maxAttempts = Math.max(1, input.policy.maxRetries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logSafe(input, "info", "AI_PROVIDER_CALL_STARTED", attempt);
      const request = buildProviderRequest(
        input.task,
        input.context,
        input.policy,
        sanitized,
      );
      const result = await input.provider.complete(request);

      if (!isValidProviderResult(result)) {
        logSafe(input, "error", "AI_PROVIDER_INVALID_RESPONSE", attempt);
        return {
          status: "failed",
          code: "AI_PROVIDER_INVALID_RESPONSE",
          sanitized,
          attempts: attempt,
        };
      }

      logSafe(input, "info", "AI_PROVIDER_CALL_COMPLETED", attempt);
      return {
        status: "completed",
        providerId: input.provider.id,
        model: input.provider.model,
        result,
        sanitized,
        attempts: attempt,
      };
    } catch (_error) {
      logSafe(input, "warn", "AI_PROVIDER_CALL_FAILED", attempt);

      if (attempt === maxAttempts) {
        return {
          status: "failed",
          code: "AI_PROVIDER_ERROR",
          sanitized,
          attempts: attempt,
        };
      }
    }
  }

  return {
    status: "failed",
    code: "AI_PROVIDER_ERROR",
    sanitized,
    attempts: maxAttempts,
  };
}

export function sanitizeAiPayload(
  payload: AiTaskPayload,
  policy: AiUsagePolicy,
): SanitizedAiPayload {
  const originalPrompt = payload.prompt.trim();
  const prompt = policy.allowRawFinancialText
    ? originalPrompt
    : maskSensitiveText(originalPrompt);
  const fields: Record<string, string | number | boolean | null> = {};
  const redactedFieldNames: string[] = [];
  const omittedFieldNames: string[] = [];

  for (const [name, value] of Object.entries(payload.fields ?? {})) {
    if (value === undefined) {
      continue;
    }

    if (!isAllowedFieldName(name, policy)) {
      omittedFieldNames.push(name);
      continue;
    }

    if (typeof value === "string") {
      const masked = maskSensitiveText(value.trim());
      fields[name] = masked;

      if (masked !== value.trim()) {
        redactedFieldNames.push(name);
      }

      continue;
    }

    fields[name] = value;
  }

  return {
    prompt,
    fields,
    redactedFieldNames,
    omittedFieldNames,
    originalPromptChars: originalPrompt.length,
    sanitizedPromptChars: prompt.length,
  };
}

export function maskSensitiveText(value: string): string {
  return value
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***documento***")
    .replace(
      /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
      "**** **** **** ****",
    )
    .replace(
      /\b\d{5,}\b/g,
      (match) => `${"*".repeat(Math.max(0, match.length - 4))}${match.slice(-4)}`,
    );
}

function buildProviderRequest(
  task: AiTaskKind,
  context: AiUsageContext,
  policy: AiUsagePolicy,
  sanitized: SanitizedAiPayload,
): SafeAiProviderRequest {
  const request: SafeAiProviderRequest = {
    task,
    purpose: policy.purpose,
    prompt: sanitized.prompt,
    fields: sanitized.fields,
    timeoutMs: policy.timeoutMs,
  };

  if (context.correlationId !== undefined) {
    request.correlationId = context.correlationId;
  }

  return request;
}

function isAllowedFieldName(name: string, policy: AiUsagePolicy): boolean {
  if (policy.allowedFieldNames !== undefined) {
    return policy.allowedFieldNames.includes(name);
  }

  return !(policy.blockedFieldNamePatterns ?? []).some((pattern) =>
    pattern.test(name),
  );
}

function isValidProviderResult(result: AiProviderResult): boolean {
  return typeof result.text === "string" && result.text.trim().length > 0;
}

function logSafe(
  input: {
    provider: AiProvider;
    task: AiTaskKind;
    context: AiUsageContext;
    logger?: SafeAiLogger;
  },
  level: AiLogLevel,
  code: string,
  attempt?: number,
): void {
  if (!input.logger) {
    return;
  }

  const event: SafeAiLogEvent = {
    level,
    code,
    providerId: input.provider.id,
    model: input.provider.model,
    task: input.task,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
  };

  if (input.context.correlationId !== undefined) {
    event.correlationId = input.context.correlationId;
  }

  if (attempt !== undefined) {
    event.attempt = attempt;
  }

  input.logger(event);
}
