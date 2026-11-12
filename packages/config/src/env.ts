export type EnvironmentName = "development" | "test" | "production";

export type RuntimeEnvironment = {
  NODE_ENV: EnvironmentName;
  DATABASE_URL: string;
  AUTH_SESSION_TTL_MINUTES: number;
};

export type RawEnvironment = Record<string, string | undefined>;

export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentValidationError";
  }
}

const allowedNodeEnvs: readonly EnvironmentName[] = ["development", "test", "production"];
const DEFAULT_AUTH_SESSION_TTL_MINUTES = 60;

export function validateRuntimeEnvironment(rawEnv: RawEnvironment): RuntimeEnvironment {
  const nodeEnv = getRequiredEnv(rawEnv, "NODE_ENV");
  const databaseUrl = getRequiredEnv(rawEnv, "DATABASE_URL");
  const authSessionTtlMinutes = getOptionalPositiveIntegerEnv(
    rawEnv,
    "AUTH_SESSION_TTL_MINUTES",
    DEFAULT_AUTH_SESSION_TTL_MINUTES,
  );

  if (!isEnvironmentName(nodeEnv)) {
    throw new EnvironmentValidationError(
      "NODE_ENV must be one of: development, test or production.",
    );
  }

  if (!databaseUrl.startsWith("postgresql://")) {
    throw new EnvironmentValidationError("DATABASE_URL must use the postgresql:// scheme.");
  }

  return {
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
    AUTH_SESSION_TTL_MINUTES: authSessionTtlMinutes,
  };
}

function getRequiredEnv(rawEnv: RawEnvironment, key: "NODE_ENV" | "DATABASE_URL"): string {
  const value = rawEnv[key];

  if (!value) {
    throw new EnvironmentValidationError(`Missing required environment variable: ${key}.`);
  }

  return value;
}

function getOptionalPositiveIntegerEnv(
  rawEnv: RawEnvironment,
  key: string,
  defaultValue: number,
): number {
  const value = rawEnv[key];

  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new EnvironmentValidationError(`${key} must be a positive integer.`);
  }

  return parsedValue;
}

function isEnvironmentName(value: string): value is EnvironmentName {
  return allowedNodeEnvs.includes(value as EnvironmentName);
}
