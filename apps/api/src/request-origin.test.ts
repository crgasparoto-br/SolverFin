import assert from "node:assert/strict";

import { AuthError } from "./auth.js";
import { assertTrustedMutationOrigin } from "./request-origin.js";

const token = "L".repeat(43);
const localEnv = {
  NODE_ENV: "development",
  APP_ORIGIN: "http://localhost:5173",
};
const localCookie = `solverfin_session=${token}`;

for (const origin of [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://0.0.0.0:5173",
  "http://192.168.1.50:5173",
  "https://solverfin-preview.example.invalid",
  "https://solverfin-preview.example.invalid:8443",
]) {
  assert.doesNotThrow(() =>
    assertTrustedMutationOrigin({
      method: "POST",
      headers: { cookie: localCookie, origin },
      env: localEnv,
    }),
  );
}

for (const origin of ["null", "file:///tmp/solverfin.html", "not-an-origin"]) {
  assert.throws(
    () =>
      assertTrustedMutationOrigin({
        method: "POST",
        headers: { cookie: localCookie, origin },
        env: localEnv,
      }),
    (error) => error instanceof AuthError && error.code === "AUTH_REQUEST_ORIGIN_INVALID",
  );
}

assert.throws(
  () =>
    assertTrustedMutationOrigin({
      method: "POST",
      headers: { cookie: localCookie },
      env: localEnv,
    }),
  (error) => error instanceof AuthError && error.code === "AUTH_REQUEST_ORIGIN_INVALID",
);

const nonLocalConfiguredDevelopmentEnv = {
  NODE_ENV: "development",
  APP_ORIGIN: "https://dev.example.invalid",
};
assert.throws(
  () =>
    assertTrustedMutationOrigin({
      method: "POST",
      headers: { cookie: localCookie, origin: "https://other.example.invalid" },
      env: nonLocalConfiguredDevelopmentEnv,
    }),
  (error) => error instanceof AuthError && error.code === "AUTH_REQUEST_ORIGIN_INVALID",
);

const productiveEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.example.invalid",
};
const productiveCookie = `__Host-solverfin_session=${token}`;
assert.doesNotThrow(() =>
  assertTrustedMutationOrigin({
    method: "POST",
    headers: { cookie: productiveCookie, origin: productiveEnv.APP_ORIGIN },
    env: productiveEnv,
  }),
);
assert.throws(
  () =>
    assertTrustedMutationOrigin({
      method: "POST",
      headers: { cookie: productiveCookie, origin: "https://preview.example.invalid" },
      env: productiveEnv,
    }),
  (error) => error instanceof AuthError && error.code === "AUTH_REQUEST_ORIGIN_INVALID",
);
