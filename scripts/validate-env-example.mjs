import { readFileSync } from "node:fs";

const envExamplePath = ".env.example";
const requiredKeys = [
  "NODE_ENV",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "DATABASE_URL",
  "AUTH_PASSWORD_RESET_URL",
  "OIDC_ISSUER_URL",
  "OIDC_AUDIENCE",
  "OIDC_JWKS_URI",
];

const sensitiveKeyPattern = /(PASSWORD|TOKEN|SECRET|KEY|DATABASE_URL)/i;
const unsafeValuePatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
];

function parseEnvFile(content) {
  const entries = new Map();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      throw new Error("Found an environment line without '=' in .env.example.");
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      throw new Error("Found an environment entry without a key in .env.example.");
    }

    entries.set(key, value);
  }

  return entries;
}

function validateEnvExample(entries) {
  const missingKeys = requiredKeys.filter((key) => !entries.has(key));

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment keys in .env.example: ${missingKeys.join(", ")}`,
    );
  }

  for (const key of requiredKeys) {
    const value = entries.get(key);

    if (!value) {
      throw new Error(`Required environment key ${key} must have a placeholder value.`);
    }
  }

  const nodeEnv = entries.get("NODE_ENV");

  if (nodeEnv !== "development") {
    throw new Error("NODE_ENV in .env.example must be the safe development placeholder.");
  }

  const postgresPort = entries.get("POSTGRES_PORT");

  if (!/^\d+$/.test(postgresPort)) {
    throw new Error("POSTGRES_PORT in .env.example must be numeric.");
  }

  const databaseUrl = entries.get("DATABASE_URL");

  if (!databaseUrl.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL in .env.example must use the postgresql:// scheme.");
  }

  const passwordResetUrl = entries.get("AUTH_PASSWORD_RESET_URL");
  const oidcIssuer = entries.get("OIDC_ISSUER_URL");
  const oidcJwksUri = entries.get("OIDC_JWKS_URI");

  if (
    !passwordResetUrl.startsWith("https://") ||
    !oidcIssuer.startsWith("https://") ||
    !oidcJwksUri.startsWith("https://")
  ) {
    throw new Error("Authentication URL placeholders must use https:// URLs.");
  }

  if (
    !passwordResetUrl.includes("example.invalid") ||
    !oidcIssuer.includes("example.invalid") ||
    !oidcJwksUri.includes("example.invalid")
  ) {
    throw new Error("Authentication URL placeholders must use example.invalid hosts.");
  }

  for (const [key, value] of entries) {
    if (unsafeValuePatterns.some((pattern) => pattern.test(value))) {
      throw new Error(`Potential real secret detected in .env.example at key ${key}.`);
    }

    if (sensitiveKeyPattern.test(key) && /prod|production|live/i.test(value)) {
      throw new Error(`Sensitive key ${key} must not use production-like placeholder values.`);
    }
  }
}

const envExample = readFileSync(envExamplePath, "utf8");
const entries = parseEnvFile(envExample);

validateEnvExample(entries);

console.log(".env.example contains required safe development placeholders.");
