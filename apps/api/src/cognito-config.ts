import { AuthError } from "./auth.js";

const COGNITO_REGION = "sa-east-1";
const COGNITO_ISSUER_HOST = `cognito-idp.${COGNITO_REGION}.amazonaws.com`;
const COGNITO_LOGIN_HOST_SUFFIX = `.auth.${COGNITO_REGION}.amazoncognito.com`;

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

export function assertTrustedCognitoEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  assertTrustedCognitoEndpoints({
    appOrigin: requireEnv(env, "APP_ORIGIN"),
    issuer: requireEnv(env, "OIDC_ISSUER_URL"),
    authorizationUrl: requireEnv(env, "OIDC_AUTHORIZATION_URL"),
    tokenUrl: requireEnv(env, "OIDC_TOKEN_URL"),
    jwksUri: requireEnv(env, "OIDC_JWKS_URI"),
    redirectUri: requireEnv(env, "OIDC_REDIRECT_URI"),
    logoutUrl: readEnv(env, "OIDC_LOGOUT_URL"),
    recoveryUrl: readEnv(env, "OIDC_RECOVERY_URL"),
  });
}

export function assertTrustedCognitoEndpoints(input: TrustedCognitoEndpoints): void {
  const appOrigin = parseHttpsUrl(input.appOrigin, "APP_ORIGIN");
  const issuer = parseHttpsUrl(input.issuer, "OIDC_ISSUER_URL");
  const authorizationUrl = parseHttpsUrl(input.authorizationUrl, "OIDC_AUTHORIZATION_URL");
  const tokenUrl = parseHttpsUrl(input.tokenUrl, "OIDC_TOKEN_URL");
  const jwksUrl = parseHttpsUrl(input.jwksUri, "OIDC_JWKS_URI");
  const redirectUrl = parseHttpsUrl(input.redirectUri, "OIDC_REDIRECT_URI");

  if (appOrigin.pathname !== "/" || appOrigin.search || appOrigin.hash) {
    throw configurationError("APP_ORIGIN must contain only the trusted HTTPS origin.");
  }

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

  if (redirectUrl.origin !== appOrigin.origin || redirectUrl.search || redirectUrl.hash) {
    throw configurationError("OIDC_REDIRECT_URI must use APP_ORIGIN without query or fragment.");
  }

  if (input.logoutUrl) {
    const logoutUrl = parseHttpsUrl(input.logoutUrl, "OIDC_LOGOUT_URL");
    if (logoutUrl.origin !== authorizationUrl.origin) {
      throw configurationError("OIDC_LOGOUT_URL must use the configured Cognito login domain.");
    }
    assertEndpointPath(logoutUrl, "/logout", "OIDC_LOGOUT_URL");
  }

  if (input.recoveryUrl) {
    const recoveryUrl = parseHttpsUrl(input.recoveryUrl, "OIDC_RECOVERY_URL");
    if (recoveryUrl.origin !== authorizationUrl.origin) {
      throw configurationError("OIDC_RECOVERY_URL must use the configured Cognito login domain.");
    }
    assertEndpointPath(recoveryUrl, "/forgotPassword", "OIDC_RECOVERY_URL");
  }
}

function assertEndpointPath(url: URL, expectedPath: string, key: string): void {
  if (url.pathname !== expectedPath || url.search || url.hash) {
    throw configurationError(
      `${key} must use the exact path ${expectedPath} without query or fragment.`,
    );
  }
}

function parseHttpsUrl(value: string, key: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw configurationError(`${key} must be a valid HTTPS URL.`);
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw configurationError(`${key} must be a valid HTTPS URL without credentials.`);
  }

  return url;
}

function normalizeUrl(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

function requireEnv(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = readEnv(env, key);
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

function configurationError(message: string): AuthError {
  return new AuthError("AUTH_OIDC_CONFIGURATION_INVALID", message, 503);
}
