import assert from "node:assert/strict";

import { ProductiveAuthConfigurationError } from "@solverfin/shared";

import { renderLoginPage } from "./login-page.js";
import { resolvePasswordResetUrl } from "./password-reset.js";

productiveRecoveryUsesBackendControlledOidcStart();
missingProductiveConfigurationFailsClosed();
configuredLocalPasswordResetRendersExternalLink();
missingLocalConfigurationKeepsActionVisibleWithGuidance();
passwordResetUrlRejectsUnsafeLocalValues();
passwordResetUrlAllowsHttpDuringLocalDevelopment();

const productiveEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.example.invalid/",
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

function productiveRecoveryUsesBackendControlledOidcStart(): void {
  const recoveryUrl = resolvePasswordResetUrl(productiveEnv);
  assert.equal(recoveryUrl, "/api/auth/oidc/start?returnTo=/dashboard");

  const html = renderLoginPage(undefined, recoveryUrl, { productiveOidc: true });
  assert.match(
    html,
    /class="forgot-password productive-recovery" href="\/api\/auth\/oidc\/start\?returnTo=\/dashboard"/,
  );
  assert.doesNotMatch(html, /forgotPassword/);
}

function missingProductiveConfigurationFailsClosed(): void {
  assert.throws(
    () =>
      resolvePasswordResetUrl({
        ...productiveEnv,
        OIDC_TOKEN_URL: undefined,
      }),
    (error) =>
      error instanceof ProductiveAuthConfigurationError && error.message.includes("OIDC_TOKEN_URL"),
  );
}

function configuredLocalPasswordResetRendersExternalLink(): void {
  const resetUrl = resolvePasswordResetUrl({
    NODE_ENV: "development",
    AUTH_PASSWORD_RESET_URL:
      "https://identity.example.invalid/reset?client=solverfin&flow=password",
  });
  const html = renderLoginPage(undefined, resetUrl);

  assert.match(html, />Esqueci minha senha<\/a>/);
  assert.match(
    html,
    /href="https:\/\/identity\.example\.invalid\/reset\?client=solverfin&amp;flow=password"/,
  );
  assert.doesNotMatch(html, /<button[^>]+data-password-reset-unavailable/);
}

function missingLocalConfigurationKeepsActionVisibleWithGuidance(): void {
  const html = renderLoginPage();

  assert.match(html, />Esqueci minha senha<\/button>/);
  assert.match(html, /data-password-reset-unavailable/);
  assert.match(html, /A recuperação de senha não está disponível neste ambiente/);
}

function passwordResetUrlRejectsUnsafeLocalValues(): void {
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "development",
      AUTH_PASSWORD_RESET_URL: "javascript:alert(1)",
    }),
    undefined,
  );
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "development",
      AUTH_PASSWORD_RESET_URL: "https://user:password@identity.example.invalid/reset",
    }),
    undefined,
  );
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "development",
      AUTH_PASSWORD_RESET_URL: "not-a-url",
    }),
    undefined,
  );
}

function passwordResetUrlAllowsHttpDuringLocalDevelopment(): void {
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "development",
      AUTH_PASSWORD_RESET_URL: "http://localhost:9090/reset-password",
    }),
    "http://localhost:9090/reset-password",
  );
}
