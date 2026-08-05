export type AiProviderFailureKind =
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "configuration"
  | "permanent";

export class AiProviderError extends Error {
  readonly kind: AiProviderFailureKind;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(
    kind: AiProviderFailureKind,
    message: string,
    options: { retryable: boolean; statusCode?: number; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiProviderError";
    this.kind = kind;
    this.retryable = options.retryable;

    if (options.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }
  }
}
