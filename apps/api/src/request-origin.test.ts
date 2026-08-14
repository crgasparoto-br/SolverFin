import assert from "node:assert/strict";

import { AuthError } from "./auth.js";
import { assertTrustedMutationOrigin } from "./request-origin.js";

const token = "L".repeat(43);
const localEnv = {
  NODE_ENV: "development",
  APP_ORIGIN: "http://localhost:5173",
};
const localCookie = `solverfin_session=${token}`;

for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"]) {
  assert.doesNotThrow(() =>
    assertTrustedMutationOrigin({
      method: "POST",
      headers: { cookie: localCookie, origin },
      env: localEnv,
    }),
  );
}

for (const origin of ["http://127.0.0.1:5174", "http://other.example.invalid:5173"]) {
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
