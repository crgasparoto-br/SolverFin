import assert from "node:assert/strict";

import { renderLoginPage } from "./login-page.js";
import { resolvePasswordResetUrl } from "./password-reset.js";

configuredPasswordResetRendersExternalLink();
missingConfigurationKeepsActionVisibleWithGuidance();
passwordResetUrlRejectsUnsafeValues();
passwordResetUrlRequiresHttpsOutsideLocalEnvironments();
passwordResetUrlAllowsHttpDuringLocalDevelopment();

function configuredPasswordResetRendersExternalLink(): void {
  const html = renderLoginPage(
    undefined,
    "https://identity.example.invalid/reset?client=solverfin&flow=password",
  );

  assert.match(html, />Esqueci minha senha<\/a>/);
  assert.match(
    html,
    /href="https:\/\/identity\.example\.invalid\/reset\?client=solverfin&amp;flow=password"/,
  );
  assert.doesNotMatch(html, /data-password-reset-unavailable/);
}

function missingConfigurationKeepsActionVisibleWithGuidance(): void {
  const html = renderLoginPage();

  assert.match(html, />Esqueci minha senha<\/button>/);
  assert.match(html, /data-password-reset-unavailable/);
  assert.match(html, /A recuperação de senha não está disponível neste ambiente/);
}

function passwordResetUrlRejectsUnsafeValues(): void {
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "production",
      AUTH_PASSWORD_RESET_URL: "javascript:alert(1)",
    }),
    undefined,
  );
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "production",
      AUTH_PASSWORD_RESET_URL: "https://user:password@identity.example.invalid/reset",
    }),
    undefined,
  );
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "production",
      AUTH_PASSWORD_RESET_URL: "not-a-url",
    }),
    undefined,
  );
}

function passwordResetUrlRequiresHttpsOutsideLocalEnvironments(): void {
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "production",
      AUTH_PASSWORD_RESET_URL: "http://identity.example.invalid/reset",
    }),
    undefined,
  );
  assert.equal(
    resolvePasswordResetUrl({
      NODE_ENV: "production",
      AUTH_PASSWORD_RESET_URL: "https://identity.example.invalid/reset",
    }),
    "https://identity.example.invalid/reset",
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
