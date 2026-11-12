import assert from "node:assert/strict";

import {
  ProductiveAuthConfigurationError,
  resolvePublicProductiveAuthConfiguration,
} from "@solverfin/shared";

import { AuthError } from "./auth.js";
import { assertTrustedCognitoEndpoints } from "./cognito-config.js";
import { assertTrustedMutationOrigin } from "./request-origin.js";

const productiveEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.example.invalid:443/",
  OIDC_ISSUER_URL: "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example",
  OIDC_CLIENT_ID: "client-123",
  OIDC_AUDIENCE: "client-123",
  OIDC_AUTHORIZATION_URL:
    "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/authorize",
  OIDC_TOKEN_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/token",
  OIDC_JWKS_URI:
    "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example/.well-known/jwks.json",
  OIDC_REDIRECT_URI: "https://app.example.invalid/api/auth/oidc/callback",
  OIDC_LOGOUT_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/logout",
  OIDC_RECOVERY_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/forgotPassword",
};

const resolved = resolvePublicProductiveAuthConfiguration(productiveEnv);
assert.equal(resolved.appOrigin, "https://app.example.invalid");
assert.equal(resolved.redirectUri, productiveEnv.OIDC_REDIRECT_URI);

assert.doesNotThrow(() =>
  assertTrustedMutationOrigin({
    method: "POST",
    headers: {
      cookie: `__Host-solverfin_session=${"A".repeat(43)}`,
      origin: "https://app.example.invalid",
    },
    env: productiveEnv,
  }),
);

assert.throws(
  () =>
    assertTrustedMutationOrigin({
      method: "POST",
      headers: {
        cookie: `__Host-solverfin_session=${"A".repeat(43)}`,
        origin: "https://other.example.invalid",
      },
      env: productiveEnv,
    }),
  (error) => error instanceof AuthError && error.code === "AUTH_REQUEST_ORIGIN_INVALID",
);

assert.throws(
  () =>
    assertTrustedCognitoEndpoints({
      appOrigin: productiveEnv.APP_ORIGIN,
      issuer: productiveEnv.OIDC_ISSUER_URL,
      authorizationUrl: productiveEnv.OIDC_AUTHORIZATION_URL,
      tokenUrl: productiveEnv.OIDC_TOKEN_URL,
      jwksUri: productiveEnv.OIDC_JWKS_URI,
      redirectUri: "https://app.example.invalid/not-the-callback",
      logoutUrl: productiveEnv.OIDC_LOGOUT_URL,
      recoveryUrl: productiveEnv.OIDC_RECOVERY_URL,
    }),
  (error) =>
    error instanceof AuthError &&
    error.code === "AUTH_OIDC_CONFIGURATION_INVALID" &&
    error.message.includes("/api/auth/oidc/callback"),
);

assert.throws(
  () =>
    resolvePublicProductiveAuthConfiguration({
      ...productiveEnv,
      OIDC_RECOVERY_URL: undefined,
    }),
  (error) =>
    error instanceof ProductiveAuthConfigurationError &&
    error.message.includes("OIDC_RECOVERY_URL"),
);
