import {
  ProductiveAuthConfigurationError,
  validateTrustedCognitoEndpoints,
  type TrustedCognitoEndpointsInput,
} from "@solverfin/shared";

import { AuthError } from "./auth.js";

export type TrustedCognitoEndpoints = TrustedCognitoEndpointsInput;

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
  try {
    validateTrustedCognitoEndpoints(input);
  } catch (error) {
    if (error instanceof ProductiveAuthConfigurationError) {
      throw configurationError(error.message);
    }
    throw error;
  }
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
