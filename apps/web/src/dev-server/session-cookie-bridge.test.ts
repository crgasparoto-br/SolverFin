import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import {
  buildUpstreamAuthenticationHeaders,
  clearApiSessionCookies,
  clearSessionCookie,
  getSessionCredentialFromRequest,
  isDemoAuthenticationAllowed,
} from "./session.js";

const productiveCookie = `__Host-solverfin_session=${"A".repeat(43)}`;
const localApiCookie = `solverfin_session=${"B".repeat(43)}`;
const legacyCookie = "sf_session_token=legacy-token";

assert.deepEqual(buildUpstreamAuthenticationHeaders(productiveCookie), {
  cookie: productiveCookie,
});
assert.deepEqual(buildUpstreamAuthenticationHeaders("local-token"), {
  authorization: "Bearer local-token",
});

assert.equal(
  getSessionCredentialFromRequest(requestWithCookie(productiveCookie), { NODE_ENV: "production" }),
  productiveCookie,
);
assert.equal(
  getSessionCredentialFromRequest(requestWithCookie(legacyCookie), { NODE_ENV: "production" }),
  undefined,
);
assert.equal(
  getSessionCredentialFromRequest(requestWithCookie(localApiCookie), { NODE_ENV: "production" }),
  undefined,
);
assert.equal(
  getSessionCredentialFromRequest(requestWithCookie(legacyCookie), { NODE_ENV: "test" }),
  "legacy-token",
);
assert.equal(
  getSessionCredentialFromRequest(requestWithCookie(localApiCookie), { NODE_ENV: "test" }),
  localApiCookie,
);
assert.equal(
  getSessionCredentialFromRequest(requestWithCookie(legacyCookie), {
    NODE_ENV: "production",
    AUTH_ALLOW_DEMO: "true",
  }),
  "legacy-token",
);
assert.equal(
  getSessionCredentialFromRequest(requestWithCookie(legacyCookie), {
    NODE_ENV: "production",
    SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION: "1",
  }),
  "legacy-token",
);

assert.equal(isDemoAuthenticationAllowed({ NODE_ENV: "development" }), true);
assert.equal(isDemoAuthenticationAllowed({ NODE_ENV: "local" }), true);
assert.equal(isDemoAuthenticationAllowed({ NODE_ENV: "test" }), true);
assert.equal(isDemoAuthenticationAllowed({ NODE_ENV: "production" }), false);
assert.equal(
  isDemoAuthenticationAllowed({ NODE_ENV: "production", AUTH_ALLOW_DEMO: "true" }),
  true,
);
assert.equal(
  isDemoAuthenticationAllowed({
    NODE_ENV: "production",
    SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION: "1",
  }),
  false,
);

const cleared = clearApiSessionCookies();
assert.equal(cleared.length, 2);
assert.match(cleared[0] ?? "", /^__Host-solverfin_session=;/);
assert.match(cleared[0] ?? "", /Secure/);
assert.match(cleared[0] ?? "", /Max-Age=0/);
assert.match(cleared[1] ?? "", /^solverfin_session=;/);
assert.doesNotMatch(cleared[1] ?? "", /Secure/);
assert.match(clearSessionCookie(), /^sf_session_token=;/);

function requestWithCookie(cookie: string): IncomingMessage {
  return { headers: { cookie } } as IncomingMessage;
}
