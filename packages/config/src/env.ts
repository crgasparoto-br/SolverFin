export type EnvironmentName = "development" | "test" | "production";

export type RuntimeEnvironment = {
  NODE_ENV: EnvironmentName;
  DATABASE_URL: string;
};

export type RawEnvironment = Record<string, string | undefined>;

export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentValidationError";
  }
}

const allowedNodeEnvs: readonly EnvironmentName[] = ["development", "test", "production"];

export function validateRuntimeEnvironment(rawEnv: RawEnvironment): RuntimeEnvironment {
  const nodeEnv = getRequiredEnv(rawEnv, "NODE_ENV");
  const databaseUrl = getRequiredEnv(rawEnv, "DATABASE_URL");

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
  };
}

function getRequiredEnv(rawEnv: RawEnvironment, key: keyof RuntimeEnvironment): string {
  const value = rawEnv[key];

  if (!value) {
    throw new EnvironmentValidationError(`Missing required environment variable: ${key}.`);
  }

  return value;
}

function isEnvironmentName(value: string): value is EnvironmentName {
  return allowedNodeEnvs.includes(value as EnvironmentName);
}
