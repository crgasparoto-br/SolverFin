const COGNITO_REGION = "sa-east-1";
const COGNITO_ISSUER_HOST = `cognito-idp.${COGNITO_REGION}.amazonaws.com`;
const COGNITO_LOGIN_HOST_SUFFIX = `.auth.${COGNITO_REGION}.amazoncognito.com`;
const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";

export interface TrustedCognitoEndpointsInput {
  appOrigin: string;
  issuer: string;
  authorizationUrl: string;
  tokenUrl: string;
  jwksUri: string;
  redirectUri: string;
  logoutUrl?: string | undefined;
  recoveryUrl?: string | undefined;
}

export interface TrustedCognitoEndpoints {
  appOrigin: string;
  issuer: string;
  authorizationUrl: string;
  tokenUrl: string;
  jwksUri: string;
  redirectUri: string;
  logoutUrl?: string | undefined;
  recoveryUrl?: string | undefined;
}

export interface PublicProductiveAuthConfiguration extends TrustedCognitoEndpoints {
  clientId: string;
}

export class ProductiveAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductiveAuthConfigurationError";
  }
}

export function resolveApplicationOrigin(
  value: string,
  options: { key?: string; allowHttp?: boolean } = {},
): string {
  const key = options.key ?? "APP_ORIGIN";
  const url = parseUrl(value, key);
  const allowedProtocol =
    url.protocol === "https:" || (options.allowHttp === true && url.protocol === "http:");

  if (!allowedProtocol || url.username || url.password) {
    throw configurationError(
      `${key} must be a trusted ${options.allowHttp ? "HTTP or HTTPS" : "HTTPS"} origin without credentials.`,
    );
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw configurationError(`${key} must contain only the trusted origin.`);
  }

  return url.origin;
}

export function validateTrustedCognitoEndpoints(
  input: TrustedCognitoEndpointsInput,
): TrustedCognitoEndpoints {
  const appOrigin = resolveApplicationOrigin(input.appOrigin);
  const issuer = parseHttpsUrl(input.issuer, "OIDC_ISSUER_URL");
  const authorizationUrl = parseHttpsUrl(input.authorizationUrl, "OIDC_AUTHORIZATION_URL");
  const tokenUrl = parseHttpsUrl(input.tokenUrl, "OIDC_TOKEN_URL");
  const jwksUrl = parseHttpsUrl(input.jwksUri, "OIDC_JWKS_URI");
  const redirectUrl = parseHttpsUrl(input.redirectUri, "OIDC_REDIRECT_URI");

  const poolId = issuer.pathname.replace(/^\//, "").replace(/\/$/, "");
  if (
    issuer.hostname !== COGNITO_ISSUER_HOST ||
    issuer.search ||
    issuer.hash ||
    !new RegExp(`^${COGNITO_REGION.replace(/-/g, "\\-")}_[A-Za-z0-9]+$`).test(poolId)
  ) {
    throw configurationError(
      `OIDC_ISSUER_URL must reference one Amazon Cognito User Pool in ${COGNITO_REGION}.`,
    );
  }

  const expectedIssuerPath = `/${poolId}`;
  if (issuer.pathname !== expectedIssuerPath && issuer.pathname !== `${expectedIssuerPath}/`) {
    throw configurationError("OIDC_ISSUER_URL must not contain additional path segments.");
  }

  const expectedJwks = `${issuer.origin}${expectedIssuerPath}/.well-known/jwks.json`;
  if (normalizeUrl(jwksUrl) !== expectedJwks) {
    throw configurationError(
      "OIDC_JWKS_URI must be the JWKS endpoint derived from OIDC_ISSUER_URL.",
    );
  }

  if (
    authorizationUrl.origin !== tokenUrl.origin ||
    !authorizationUrl.hostname.endsWith(COGNITO_LOGIN_HOST_SUFFIX) ||
    authorizationUrl.hostname === COGNITO_LOGIN_HOST_SUFFIX.slice(1)
  ) {
    throw configurationError(
      `OIDC authorization and token endpoints must use one Cognito managed domain in ${COGNITO_REGION}.`,
    );
  }

  assertEndpointPath(authorizationUrl, "/oauth2/authorize", "OIDC_AUTHORIZATION_URL");
  assertEndpointPath(tokenUrl, "/oauth2/token", "OIDC_TOKEN_URL");

  if (
    redirectUrl.origin !== appOrigin ||
    redirectUrl.pathname !== OIDC_CALLBACK_PATH ||
    redirectUrl.search ||
    redirectUrl.hash
  ) {
    throw configurationError(
      `OIDC_REDIRECT_URI must be exactly ${appOrigin}${OIDC_CALLBACK_PATH}.`,
    );
  }

  const logoutUrl = input.logoutUrl
    ? parseManagedEndpoint(
        input.logoutUrl,
        authorizationUrl.origin,
        "/logout",
        "OIDC_LOGOUT_URL",
      )
    : undefined;
  const recoveryUrl = input.recoveryUrl
    ? parseManagedEndpoint(
        input.recoveryUrl,
        authorizationUrl.origin,
        "/forgotPassword",
        "OIDC_RECOVERY_URL",
      )
    : undefined;

  return {
    appOrigin,
    issuer: `${issuer.origin}${expectedIssuerPath}`,
    authorizationUrl: normalizeUrl(authorizationUrl),
    tokenUrl: normalizeUrl(tokenUrl),
    jwksUri: expectedJwks,
    redirectUri: normalizeUrl(redirectUrl),
    ...(logoutUrl ? { logoutUrl } : {}),
    ...(recoveryUrl ? { recoveryUrl } : {}),
  };
}

export function resolvePublicProductiveAuthConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): PublicProductiveAuthConfiguration {
  const clientId = requireEnv(env, "OIDC_CLIENT_ID", env.OIDC_AUDIENCE);
  const audience = readEnv(env, "OIDC_AUDIENCE");

  if (audience && audience !== clientId) {
    throw configurationError(
      "OIDC_AUDIENCE must match OIDC_CLIENT_ID while the compatibility alias exists.",
    );
  }

  const endpoints = validateTrustedCognitoEndpoints({
    appOrigin: requireEnv(env, "APP_ORIGIN"),
    issuer: requireEnv(env, "OIDC_ISSUER_URL"),
    authorizationUrl: requireEnv(env, "OIDC_AUTHORIZATION_URL"),
    tokenUrl: requireEnv(env, "OIDC_TOKEN_URL"),
    jwksUri: requireEnv(env, "OIDC_JWKS_URI"),
    redirectUri: requireEnv(env, "OIDC_REDIRECT_URI"),
    logoutUrl: requireEnv(env, "OIDC_LOGOUT_URL"),
    recoveryUrl: requireEnv(env, "OIDC_RECOVERY_URL"),
  });

  return { ...endpoints, clientId };
}

function parseManagedEndpoint(
  value: string,
  expectedOrigin: string,
  expectedPath: string,
  key: string,
): string {
  const url = parseHttpsUrl(value, key);
  if (url.origin !== expectedOrigin) {
    throw configurationError(`${key} must use the configured Cognito login domain.`);
  }
  assertEndpointPath(url, expectedPath, key);
  return normalizeUrl(url);
}

function assertEndpointPath(url: URL, expectedPath: string, key: string): void {
  if (url.pathname !== expectedPath || url.search || url.hash) {
    throw configurationError(
      `${key} must use the exact path ${expectedPath} without query or fragment.`,
    );
  }
}

function parseHttpsUrl(value: string, key: string): URL {
  const url = parseUrl(value, key);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw configurationError(`${key} must be a valid HTTPS URL without credentials.`);
  }
  return url;
}

function parseUrl(value: string, key: string): URL {
  try {
    return new URL(value);
  } catch {
    throw configurationError(`${key} must be a valid URL.`);
  }
}

function normalizeUrl(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

function requireEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  fallback?: string,
): string {
  const value = readEnv(env, key) ?? fallback?.trim();
  if (!value) throw configurationError(`Missing required environment variable: ${key}.`);
  return value;
}

function readEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function configurationError(message: string): ProductiveAuthConfigurationError {
  return new ProductiveAuthConfigurationError(message);
}
