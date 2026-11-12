import { readFileSync } from "node:fs";

const envExamplePath = ".env.example";
const requiredKeys = [
  "NODE_ENV",
  "APP_ORIGIN",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "DATABASE_URL",
  "AUTH_PASSWORD_RESET_URL",
  "AI_PROVIDER",
  "AI_OPENAI_ENDPOINT",
  "AI_OPENAI_API_KEY",
  "AI_OPENAI_MODEL",
  "AI_OPENAI_MAX_OUTPUT_TOKENS",
  "AI_OPENAI_MAX_REQUEST_BYTES",
  "AI_OPENAI_REQUEST_TIMEOUT_MS",
  "FINANCIAL_ASSISTANT_TTL_MINUTES",
  "OIDC_ISSUER_URL",
  "OIDC_CLIENT_ID",
  "OIDC_AUDIENCE",
  "OIDC_AUTHORIZATION_URL",
  "OIDC_TOKEN_URL",
  "OIDC_JWKS_URI",
  "OIDC_REDIRECT_URI",
  "OIDC_LOGOUT_URL",
  "OIDC_RECOVERY_URL",
  "OIDC_ATTEMPT_ENCRYPTION_KEY",
  "OIDC_ATTEMPT_TTL_MINUTES",
  "OIDC_ATTEMPT_CLEANUP_INTERVAL_MS",
];

const sensitiveKeyPattern = /(PASSWORD|TOKEN|SECRET|KEY|DATABASE_URL)/i;
const unsafeValuePatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
];
const managedPlaceholderHost = "solverfin-auth.auth.sa-east-1.amazoncognito.com";

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

  const assistantTtlMinutes = Number(entries.get("FINANCIAL_ASSISTANT_TTL_MINUTES"));
  if (!Number.isInteger(assistantTtlMinutes) || assistantTtlMinutes < 5 || assistantTtlMinutes > 1440) {
    throw new Error(
      "FINANCIAL_ASSISTANT_TTL_MINUTES in .env.example must be an integer from 5 to 1440.",
    );
  }

  validateAiPlaceholders(entries);

  const authenticationUrls = [
    entries.get("AUTH_PASSWORD_RESET_URL"),
    entries.get("OIDC_ISSUER_URL"),
    entries.get("OIDC_AUTHORIZATION_URL"),
    entries.get("OIDC_TOKEN_URL"),
    entries.get("OIDC_JWKS_URI"),
    entries.get("OIDC_REDIRECT_URI"),
    entries.get("OIDC_LOGOUT_URL"),
    entries.get("OIDC_RECOVERY_URL"),
  ];

  if (authenticationUrls.some((value) => !value.startsWith("https://"))) {
    throw new Error("Authentication URL placeholders must use https:// URLs.");
  }

  if (
    authenticationUrls.some((value) => {
      const url = new URL(value);
      return (
        !value.includes("example.invalid") &&
        !value.includes("sa-east-1_example") &&
        url.hostname !== managedPlaceholderHost
      );
    })
  ) {
    throw new Error("Authentication URL placeholders must use the approved fictitious values.");
  }

  const issuer = new URL(entries.get("OIDC_ISSUER_URL"));
  const jwks = new URL(entries.get("OIDC_JWKS_URI"));
  const authorization = new URL(entries.get("OIDC_AUTHORIZATION_URL"));
  const token = new URL(entries.get("OIDC_TOKEN_URL"));
  const logout = new URL(entries.get("OIDC_LOGOUT_URL"));
  const recovery = new URL(entries.get("OIDC_RECOVERY_URL"));
  const expectedJwks = `${issuer.origin}${issuer.pathname.replace(/\/$/, "")}/.well-known/jwks.json`;

  if (jwks.toString() !== expectedJwks) {
    throw new Error("OIDC_JWKS_URI placeholder must be derived from OIDC_ISSUER_URL.");
  }

  if (
    authorization.hostname !== managedPlaceholderHost ||
    token.origin !== authorization.origin ||
    logout.origin !== authorization.origin ||
    recovery.origin !== authorization.origin
  ) {
    throw new Error("Cognito login endpoint placeholders must share the managed domain.");
  }

  if (
    authorization.pathname !== "/oauth2/authorize" ||
    token.pathname !== "/oauth2/token" ||
    logout.pathname !== "/logout" ||
    recovery.pathname !== "/forgotPassword"
  ) {
    throw new Error("Cognito login endpoint placeholders must use canonical paths.");
  }

  if (Buffer.from(entries.get("OIDC_ATTEMPT_ENCRYPTION_KEY"), "base64").length !== 32) {
    throw new Error("OIDC_ATTEMPT_ENCRYPTION_KEY placeholder must decode to 32 bytes.");
  }

  if (Number(entries.get("OIDC_ATTEMPT_CLEANUP_INTERVAL_MS")) < 10_000) {
    throw new Error("OIDC_ATTEMPT_CLEANUP_INTERVAL_MS placeholder must be at least 10000.");
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

function validateAiPlaceholders(entries) {
  if (entries.get("AI_PROVIDER") !== "disabled") {
    throw new Error("AI_PROVIDER in .env.example must default to disabled.");
  }

  const endpoint = new URL(entries.get("AI_OPENAI_ENDPOINT"));

  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
    throw new Error("AI_OPENAI_ENDPOINT placeholder must be a credential-free HTTPS URL.");
  }

  if (entries.get("AI_OPENAI_API_KEY") !== "solverfin-ai-disabled-placeholder") {
    throw new Error("AI_OPENAI_API_KEY must use the approved disabled placeholder.");
  }

  for (const key of [
    "AI_OPENAI_MAX_OUTPUT_TOKENS",
    "AI_OPENAI_MAX_REQUEST_BYTES",
    "AI_OPENAI_REQUEST_TIMEOUT_MS",
  ]) {
    const value = Number(entries.get(key));

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${key} in .env.example must be a positive integer.`);
    }
  }
}

const envExample = readFileSync(envExamplePath, "utf8");
const entries = parseEnvFile(envExample);

validateEnvExample(entries);

console.log(".env.example contains required safe development placeholders.");
